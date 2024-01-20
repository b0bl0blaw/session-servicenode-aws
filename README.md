# Session Service Node for AWS

CDK commands may be run with an optional AWS profile: `npx cdk --profile PROFILE_NAME COMMAND`

This will use your default configured AWS region to deploy services.

## Setup steps

### Initialize the CDK environment (one-time)

`npx cdk bootstrap`

### Diff the stack to validate resources being created

`npx cdk diff SessionStack`

### Deploy the stack

`npx cdk deploy SessionStack`

### Deploy to a separate region (optional)

Use an AWS profile configured to the region you'd like.
IE: `npx cdk --profile PROFILE_NAME_WEST1 deploy SessionStack`

First time CDK deploys to this new region will require a [bootstrap](#initialize-the-cdk-environment-one-time)

## Service node registration

The EC2 instance that the services are started on are configured with Session Manager. Connect to the instance using
Session Manager in the EC2 console and run the following commands.

* `sudo -s` - elevate
* `docker ps` - list containers
* `docker exec -it SERVICENODE_CONTAINER_HASH exec bash` - bash into the service node container where
  SERVICENODE_CONTAINER_HASH is the container hash for the `sn-session` container.
* `oxend prepare_registration` - run the typical oxend registration command

## Notes

* Initialization of the service nodes will take some time as it syncs with the network.
* All logs are output to the ECS service if debugging is needed.

### Maintaining a service node

TBD...
