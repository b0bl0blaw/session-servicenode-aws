#!/bin/bash
set -eo pipefail

# yes | oxend-download-lmdb https://public.loki.foundation/loki/data.mdb

if [ ! -z "$AS_FARGATE" ] && [ "$AS_FARGATE" = true ]; then
  TASK_ARN=$(aws ecs list-tasks --cluster "$ECS_CLUSTER_NAME" --service-name "$ECS_SERVICE_NAME" --query 'taskArns[0]' --output text)
  TASK_DETAILS=$(aws ecs describe-tasks --cluster "$ECS_CLUSTER_NAME" --task "${TASK_ARN}" --query 'tasks[0].attachments[0].details')
  ENI=$(echo $TASK_DETAILS | jq -r '.[] | select(.name=="networkInterfaceId").value')
  PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "${ENI}" --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
else:
  TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  PUBLIC_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
fi

echo "Using public IP address: ${PUBLIC_IP}"

exec "$@" --service-node-public-ip ${PUBLIC_IP}