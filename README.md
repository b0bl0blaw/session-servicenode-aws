# Session Service Node for AWS

CDK commands may be run with an optional AWS profile: `npx cdk --profile PROFILE_NAME COMMAND`

This will use your default configured AWS region to deploy services.

## Setup steps

INSTANCE_COUNT is used to define the `amount` of service nodes you would like to create in that region.

### Initialize the CDK environment (one-time)

`npx cdk bootstrap`

### Diff the stack to validate resources being created

`npx cdk diff SessionStack -c INSTANCE_COUNT=1`

### Deploy the stack

`npx cdk deploy SessionStack -c INSTANCE_COUNT=1`

### Deploy to a separate region (optional)

Use an AWS profile configured to the region you'd like.
IE: `npx cdk --profile PROFILE_NAME_WEST1 deploy SessionStack -c INSTANCE_COUNT=1`

First time CDK deploys to this new region will require a [bootstrap](#initialize-the-cdk-environment-one-time)

### Add another service node in the future to this region (optional)

* [diff](#diff-the-stack-to-validate-resources-being-created) the stack with a higher INSTANCE_COUNT
* [deploy](#deploy-the-stack) the stack with a higher INSTANCE_COUNT

### Service node registration

The EC2 instance that the services are started on are configured with Session Manager. Connect to an instance using
Session Manager in the EC2 console and run the following commands.

* `sudo -s` - elevate
* `docker ps` - list containers
* `docker exec -it SERVICENODE_CONTAINER_HASH exec bash` - bash into the service node container where
  SERVICENODE_CONTAINER_HASH is the container hash for the `sn-session` container
* `oxend prepare_registration` - run the typical oxend registration command

### Maintaining a service node

Updating the service node software
TBD...

## Notes

* Multiple service nodes will generally have resources suffixed with their instance count number
* Initialization of the service nodes will take some time as it syncs with the network
* All logs are output to the ECS service if debugging is needed
* Downscaling service nodes can be done by decrementing INSTANCE_COUNT
