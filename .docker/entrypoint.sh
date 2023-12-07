#!/bin/bash
set -eo pipefail

# yes | oxend-download-lmdb https://public.loki.foundation/loki/data.mdb

aws configure set region ${AWS_REGION}

TASK_ARN=$(aws ecs list-tasks --cluster "$ECS_CLUSTER_NAME" --service-name "$ECS_SERVICE_NAME" --query 'taskArns[0]' --output text)
TASK_DETAILS=$(aws ecs describe-tasks --cluster "$ECS_CLUSTER_NAME" --task "${TASK_ARN}" --query 'tasks[0].attachments[0].details')
ENI=$(echo $TASK_DETAILS | jq -r '.[] | select(.name=="networkInterfaceId").value')
FARGATE_PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "${ENI}" --query 'NetworkInterfaces[0].Association.PublicIp' --output text)

echo "Using public IP address: ${FARGATE_PUBLIC_IP}"

exec "$@" --service-node-public-ip ${FARGATE_PUBLIC_IP}