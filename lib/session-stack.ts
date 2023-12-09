import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { InstanceClass, InstanceSize, MachineImage } from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Capability, Protocol } from "aws-cdk-lib/aws-ecs";
import * as efs from "aws-cdk-lib/aws-efs";
import * as iam from "aws-cdk-lib/aws-iam";
import { AnyPrincipal, Effect, Role } from "aws-cdk-lib/aws-iam";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as logs from "aws-cdk-lib/aws-logs";

interface BuildParams {
  vpc: ec2.IVpc;
  ecsCluster: ecs.ICluster;
  efsFilesystem: efs.IFileSystem;
  taskRole: iam.IRole;
  executionRole: iam.IRole;
  logGroup: logs.ILogGroup;
  volumeName: string;
}

export class SessionStack extends cdk.Stack {
  private readonly SESSION_BACKUP_DB_ARN =
    "arn:aws:s3:::session-lmdb-backups/*";

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const asFargate = false;
    const volumeName = "efsVolume";

    const vpc = this.createVpc();
    const efsFilesystem = this.createEfs(vpc);
    const ecsCluster = this.createCluster(vpc, asFargate);
    const taskRole = this.createEcsTaskRole(efsFilesystem);
    const executionRole = this.createEcsExecutionRole(efsFilesystem);
    const securityGroup = this.createSecurityGroup(vpc);
    const logGroup = new logs.LogGroup(this, "sessionServiceLogGroup");

    const buildParams: BuildParams = {
      vpc,
      ecsCluster,
      efsFilesystem,
      taskRole,
      executionRole,
      logGroup,
      volumeName,
    };

    if (asFargate) {
      this.createFargateService(buildParams, [securityGroup]);
    } else {
      this.createEc2ServiceNodeService(buildParams);
      this.createEc2StorageServerService(buildParams);
      this.createEc2LokinetService(buildParams);
    }
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

  private createCluster(vpc: ec2.IVpc, asFargate: boolean): ecs.Cluster {
    const clusterName = "sessionCluster";

    const cluster = new ecs.Cluster(this, "sessionCluster", {
      clusterName: clusterName,
      vpc: vpc,
    });

    if (!asFargate) {
      const autoScalingGroup = new autoscaling.AutoScalingGroup(
        this,
        "sessionAutoScalingGroup",
        {
          vpc: vpc,
          instanceType: ec2.InstanceType.of(
            InstanceClass.T3A,
            InstanceSize.MEDIUM,
          ),
          machineImage: MachineImage.lookup({
            name: "al2023-ami-ecs-hvm-2023.0.20231204-kernel-6.1-x86_64",
          }),
          associatePublicIpAddress: true,
          role: Role.fromRoleName(
            this,
            "sessionInstanceProfile",
            "AmazonSSMRoleForInstancesQuickSetup",
          ),
          newInstancesProtectedFromScaleIn: false,
        },
      );

      const capacityProvider = new ecs.AsgCapacityProvider(
        this,
        "sessionCapacityProvider",
        {
          autoScalingGroup: autoScalingGroup,
        },
      );

      cluster.addAsgCapacityProvider(capacityProvider);
    }

    return cluster;
  }

  private createTaskDefinition(
    asFargate: boolean,
    resourceId: string,
    params: BuildParams,
  ): ecs.TaskDefinition {
    const compatibilityMode = asFargate
      ? ecs.Compatibility.FARGATE
      : ecs.Compatibility.EC2;

    const networkMode = asFargate
      ? ecs.NetworkMode.AWS_VPC
      : ecs.NetworkMode.HOST;

    let cpu = undefined;
    let memory = undefined;

    if (asFargate) {
      cpu = "2048";
      memory = "3072";
    }

    return new ecs.TaskDefinition(this, resourceId, {
      compatibility: compatibilityMode,
      networkMode: networkMode,
      family: "session",
      cpu: cpu,
      memoryMiB: memory,
      volumes: [
        {
          name: params.volumeName,
          efsVolumeConfiguration: {
            fileSystemId: params.efsFilesystem.fileSystemId,
          },
        },
      ],
      taskRole: params.taskRole,
      executionRole: params.executionRole,
    });
  }

  private createSecurityGroup(vpc: ec2.IVpc): ec2.SecurityGroup {
    const ecsSecurityGroup = new ec2.SecurityGroup(
      this,
      "sessionSecurityGroup",
      {
        vpc: vpc,
      },
    );

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(1090));

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22020));

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22021));

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22022));

    ecsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22025));

    ecsSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic());

    return ecsSecurityGroup;
  }

  private createEc2ServiceNodeService(params: BuildParams): ecs.Ec2Service {
    const serviceName = "serviceNode";
    const taskDefinition = this.createTaskDefinition(
      false,
      "snTaskDefinition",
      params,
    );
    const serviceNodeContainer = taskDefinition.addContainer(
      "session-service-node",
      {
        containerName: "sn-session",
        image: ecs.ContainerImage.fromRegistry(
          "b0bl0blawslawbl0g/session-sn-aws",
        ),
        essential: true,
        privileged: false,
        logging: ecs.LogDriver.awsLogs({
          logGroup: params.logGroup,
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
          AS_FARGATE: "false",
          EFS_FILE_SYSTEM_ID: params.efsFilesystem.fileSystemId,
          ECS_SERVICE_NAME: serviceName,
          ECS_CLUSTER_NAME: params.ecsCluster.clusterName,
          AWS_REGION: params.ecsCluster.stack.region,
        },
      },
    );

    serviceNodeContainer.addMountPoints({
      sourceVolume: params.volumeName,
      containerPath: "/efs",
      readOnly: false,
    });

    return new ecs.Ec2Service(this, "sessionEc2ServiceNodeService", {
      cluster: params.ecsCluster,
      serviceName: serviceName,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
    });
  }

  private createEc2StorageServerService(params: BuildParams): ecs.Ec2Service {
    const serviceName = "storageServer";
    const taskDefinition = this.createTaskDefinition(
      false,
      "ssTaskDefinition",
      params,
    );
    const storageServerContainer = taskDefinition.addContainer(
      "session-storage-server",
      {
        containerName: "ss-session",
        image: ecs.ContainerImage.fromRegistry(
          "b0bl0blawslawbl0g/session-ss-aws",
        ),
        essential: true,
        privileged: false,
        logging: ecs.LogDriver.awsLogs({
          logGroup: params.logGroup,
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
          AS_FARGATE: "false",
          EFS_FILE_SYSTEM_ID: params.efsFilesystem.fileSystemId,
          ECS_SERVICE_NAME: serviceName,
          ECS_CLUSTER_NAME: params.ecsCluster.clusterName,
          AWS_REGION: params.ecsCluster.stack.region,
        },
      },
    );

    storageServerContainer.addMountPoints({
      sourceVolume: params.volumeName,
      containerPath: "/efs",
      readOnly: false,
    });

    return new ecs.Ec2Service(this, "sessionEc2StorageServerService", {
      cluster: params.ecsCluster,
      serviceName: "storageServer",
      taskDefinition: taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
    });
  }

  private createEc2LokinetService(params: BuildParams): ecs.Ec2Service {
    const serviceName = "lokinet";
    const taskDefinition = this.createTaskDefinition(
      false,
      "lokinetTaskDefinition",
      params,
    );
    const linuxParameters = new ecs.LinuxParameters(
      this,
      "sessionLokinetContainerParameters",
    );

    linuxParameters.addCapabilities(Capability.NET_ADMIN);

    const lokinetContainer = taskDefinition.addContainer(
      "session-lokinet-server",
      {
        containerName: "lokinet-session",
        image: ecs.ContainerImage.fromRegistry(
          "b0bl0blawslawbl0g/session-lokinet-aws",
        ),
        essential: true,
        privileged: false,
        logging: ecs.LogDriver.awsLogs({
          logGroup: params.logGroup,
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
          AS_FARGATE: "false",
          EFS_FILE_SYSTEM_ID: params.efsFilesystem.fileSystemId,
          ECS_SERVICE_NAME: serviceName,
          ECS_CLUSTER_NAME: params.ecsCluster.clusterName,
          AWS_REGION: params.ecsCluster.stack.region,
        },
        linuxParameters: linuxParameters,
      },
    );

    lokinetContainer.addMountPoints({
      sourceVolume: params.volumeName,
      containerPath: "/efs",
      readOnly: false,
    });

    return new ecs.Ec2Service(this, "sessionEc2LokinetService", {
      cluster: params.ecsCluster,
      serviceName: "lokinet",
      taskDefinition: taskDefinition,
      desiredCount: 1,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
    });
  }

  private createFargateService(
    params: BuildParams,
    ecsSecurityGroups: ec2.SecurityGroup[],
  ): ecs.FargateService {
    const serviceName = "fargateNode";
    const taskDefinition = this.createTaskDefinition(
      true,
      "fargateTaskDefinition",
      params,
    );

    return new ecs.FargateService(this, "sessionFargateService", {
      cluster: params.ecsCluster,
      serviceName: serviceName,
      taskDefinition: taskDefinition,
      assignPublicIp: true,
      vpcSubnets: params.vpc.selectSubnets(),
      desiredCount: 1,
      securityGroups: ecsSecurityGroups,
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

    const s3PolicyDocument = new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["s3:GetObject"],
      resources: [this.SESSION_BACKUP_DB_ARN],
    });

    const policyDocument = new iam.PolicyDocument({
      statements: [ecsPolicyDocument, ecrPolicyStatement, s3PolicyDocument],
    });

    return new iam.Role(this, "sessionTaskRole", {
      assumedBy: servicePrincipal,
      inlinePolicies: {
        sessionRole: policyDocument,
      },
    });
  }
}
