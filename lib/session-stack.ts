import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Protocol } from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import { AnyPrincipal, Effect } from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";

export class SessionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = this.createVpc();
    const efsFilesystem = this.createEfs(vpc);
    const ecsCluster = this.createCluster(vpc);
    const taskRole = this.createEcsTaskRole(efsFilesystem);
    const executionRole = this.createEcsExecutionRole(efsFilesystem);

    this.createService(vpc, ecsCluster, efsFilesystem, taskRole, executionRole);
  }

  private createVpc(): ec2.Vpc {
    return new ec2.Vpc(this, "sessionVpc", {
      vpcName: "Session VPC",
      subnetConfiguration: [
        {
          cidrMask: 28,
          name: "session",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      ipAddresses: ec2.IpAddresses.cidr("10.0.69.0/24"),
      enableDnsSupport: true,
    });
  }

  private createEfs(vpc: ec2.IVpc): efs.FileSystem {
    const efsSecurityGroup = new ec2.SecurityGroup(
      this,
      "sessionEfsSecurityGroup",
      {
        vpc: vpc,
      },
    );

    efsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("10.0.69.0/24"),
      ec2.Port.tcp(2049),
    );

    efsSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic());

    const fileSystem = new efs.FileSystem(this, "sessionEfs", {
      vpc: vpc,
      securityGroup: efsSecurityGroup,
    });

    const efsPolicyStatement = new iam.PolicyStatement({
      effect: Effect.ALLOW,
      principals: [new AnyPrincipal()],
      actions: ["*"],
    });

    fileSystem.addToResourcePolicy(efsPolicyStatement);

    return fileSystem;
  }

  private createCluster(vpc: ec2.IVpc): ecs.Cluster {
    return new ecs.Cluster(this, "sessionCluster", {
      clusterName: "sessionCluster",
      vpc: vpc,
    });
  }

  private createService(
    vpc: ec2.IVpc,
    cluster: ecs.ICluster,
    efsFilesystem: efs.IFileSystem,
    taskRole: iam.IRole,
    executionRole: iam.IRole,
  ): ecs.FargateService {
    const serviceName = "sessionNode1";
    const volumeName = "efsVolume";

    const sessionTaskDefinition = new ecs.TaskDefinition(
      this,
      "sessionTaskDefinition",
      {
        compatibility: ecs.Compatibility.FARGATE,
        networkMode: ecs.NetworkMode.AWS_VPC,
        family: "session",
        cpu: "1024",
        memoryMiB: "3072",
        volumes: [
          {
            name: volumeName,
            efsVolumeConfiguration: {
              fileSystemId: efsFilesystem.fileSystemId,
            },
          },
        ],
        taskRole: taskRole,
        executionRole: executionRole,
      },
    );

    const serviceLogGroup = new logs.LogGroup(this, "sessionServiceLogGroup", {
      logGroupName: "sessionLogGroup",
    });

    const serviceNodeContainer = sessionTaskDefinition.addContainer(
      "session-service-node",
      {
        containerName: "sn-session",
        image: ecs.ContainerImage.fromRegistry(
          "b0bl0blawslawbl0g/session-sn-aws",
        ),
        essential: true,
        privileged: false,
        logging: ecs.LogDriver.awsLogs({
          logGroup: serviceLogGroup,
          streamPrefix: "ecs",
        }),
        portMappings: [
          {
            containerPort: 22022,
            hostPort: 22022,
            protocol: Protocol.TCP,
          },
          {
            containerPort: 22025,
            hostPort: 22025,
            protocol: Protocol.TCP,
          },
        ],
        environment: {
          EFS_FILE_SYSTEM_ID: efsFilesystem.fileSystemId,
          ECS_SERVICE_NAME: serviceName,
          ECS_CLUSTER_NAME: cluster.clusterName,
        },
      },
    );

    serviceNodeContainer.addMountPoints({
      sourceVolume: volumeName,
      containerPath: "/efs",
      readOnly: false,
    });

    const storageServerContainer = sessionTaskDefinition.addContainer(
      "session-storage-server",
      {
        containerName: "ss-session",
        image: ecs.ContainerImage.fromRegistry(
          "b0bl0blawslawbl0g/session-ss-aws",
        ),
        essential: false,
        privileged: false,
        logging: ecs.LogDriver.awsLogs({
          logGroup: serviceLogGroup,
          streamPrefix: "ecs",
        }),
        portMappings: [
          {
            containerPort: 22020,
            hostPort: 22020,
            protocol: Protocol.TCP,
          },
          {
            containerPort: 22021,
            hostPort: 22021,
            protocol: Protocol.TCP,
          },
        ],
        environment: {
          EFS_FILE_SYSTEM_ID: efsFilesystem.fileSystemId,
          ECS_SERVICE_NAME: serviceName,
          ECS_CLUSTER_NAME: cluster.clusterName,
        },
      },
    );

    storageServerContainer.addMountPoints({
      sourceVolume: volumeName,
      containerPath: "/efs",
      readOnly: false,
    });

    const lokinetContainer = sessionTaskDefinition.addContainer(
      "session-lokinet-server",
      {
        containerName: "lokinet-session",
        image: ecs.ContainerImage.fromRegistry(
          "b0bl0blawslawbl0g/session-lokinet-aws",
        ),
        essential: false,
        privileged: false,
        logging: ecs.LogDriver.awsLogs({
          logGroup: serviceLogGroup,
          streamPrefix: "ecs",
        }),
        portMappings: [
          {
            containerPort: 1090,
            hostPort: 1090,
            protocol: Protocol.UDP,
          },
        ],
        environment: {
          EFS_FILE_SYSTEM_ID: efsFilesystem.fileSystemId,
          ECS_SERVICE_NAME: serviceName,
          ECS_CLUSTER_NAME: cluster.clusterName,
        },
      },
    );

    lokinetContainer.addMountPoints({
      sourceVolume: volumeName,
      containerPath: "/efs",
      readOnly: false,
    });

    const ecsSecurityGroup = new ec2.SecurityGroup(
      this,
      "sessionEcsSecurityGroup",
      {
        vpc: vpc,
      },
    );

    // @TODO Restrict this
    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(1090));

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22020));

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22021));

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22022));

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22025));

    ecsSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic());

    return new ecs.FargateService(this, "sessionFargateService", {
      cluster: cluster,
      serviceName: serviceName,
      taskDefinition: sessionTaskDefinition,
      assignPublicIp: true,
      vpcSubnets: vpc.selectSubnets(),
      desiredCount: 0,
      securityGroups: [ecsSecurityGroup],
    });
  }

  private createEcsExecutionRole(efsFilesystem: efs.IFileSystem): iam.Role {
    const servicePrincipal = new iam.ServicePrincipal(
      "ecs-tasks.amazonaws.com",
    );

    const efsPolicyStatement = new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "elasticfilesystem:ClientMount",
        "elasticfilesystem:ClientWrite",
      ],
      resources: [efsFilesystem.fileSystemArn],
    });

    const policyDocument = new iam.PolicyDocument({
      statements: [efsPolicyStatement],
    });

    return new iam.Role(this, "sessionExecutionRole", {
      assumedBy: servicePrincipal,
      inlinePolicies: {
        sessionRole: policyDocument,
      },
    });
  }

  private createEcsTaskRole(efsFilesystem: efs.IFileSystem): iam.Role {
    const servicePrincipal = new iam.ServicePrincipal(
      "ecs-tasks.amazonaws.com",
    );
    const ecsPolicyDocument = new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "ecs:ListTasks",
        "ecs:DescribeTasks",
        "ec2:DescribeNetworkInterfaces",
      ],
      resources: ["*"],
    });

    const ecrPolicyStatement = new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["elasticfilesystem:*"],
      resources: [efsFilesystem.fileSystemArn],
    });

    const policyDocument = new iam.PolicyDocument({
      statements: [ecsPolicyDocument, ecrPolicyStatement],
    });

    return new iam.Role(this, "sessionTaskRole", {
      assumedBy: servicePrincipal,
      inlinePolicies: {
        sessionRole: policyDocument,
      },
    });
  }
}
