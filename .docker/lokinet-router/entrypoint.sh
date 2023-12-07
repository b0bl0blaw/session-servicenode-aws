#!/bin/bash
set -eo pipefail

mkdir -p /efs/lokinet
touch /efs/lokinet/self.signed

aws configure set region ${AWS_REGION}

TASK_ARN=$(aws ecs list-tasks --cluster "$ECS_CLUSTER_NAME" --service-name "$ECS_SERVICE_NAME" --query 'taskArns[0]' --output text)
TASK_DETAILS=$(aws ecs describe-tasks --cluster "$ECS_CLUSTER_NAME" --task "${TASK_ARN}" --query 'tasks[0].attachments[0].details')
ENI=$(echo $TASK_DETAILS | jq -r '.[] | select(.name=="networkInterfaceId").value')

export FARGATE_PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "${ENI}" --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
export FARGATE_PRIVATE_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "${ENI}" --query 'NetworkInterfaces[0].PrivateIpAddress' --output text)

echo "Using public IP address: ${FARGATE_PUBLIC_IP}"
echo "Using private IP address: ${FARGATE_PRIVATE_IP}"

envsubst < /etc/loki/lokinet-router.ini > /opt/lokinet-router.ini

mkdir -p /dev/net
mknod /dev/net/tun c 10 200
chown _lokinet /dev/net/tun

exec "$@"