#!/bin/bash
set -eo pipefail

mkdir -p /efs/lokinet
touch /efs/lokinet/self.signed

DATA_FILE_PATH="/efs/session-node/lmdb/data.mdb"

while [ ! -e "$DATA_FILE_PATH" ]; do
    echo "LMDB not present, waiting to start lokinet..."
    sleep 10
done

if [ -n "$AS_FARGATE" ] && [ "$AS_FARGATE" = true ]; then
  TASK_ARN=$(aws ecs list-tasks --cluster "$ECS_CLUSTER_NAME" --service-name "$ECS_SERVICE_NAME" --query 'taskArns[0]' --output text)
  TASK_DETAILS=$(aws ecs describe-tasks --cluster "$ECS_CLUSTER_NAME" --task "${TASK_ARN}" --query 'tasks[0].attachments[0].details')
  ENI=$(echo "$TASK_DETAILS" | jq -r '.[] | select(.name=="networkInterfaceId").value')

  export PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "${ENI}" --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
  export PRIVATE_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "${ENI}" --query 'NetworkInterfaces[0].PrivateIpAddress' --output text)
else
  TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  export PUBLIC_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
  export PRIVATE_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4)
fi

echo "Using public IP address: ${PUBLIC_IP}"
echo "Using private IP address: ${PRIVATE_IP}"

envsubst < /etc/loki/lokinet-router.ini > /opt/lokinet-router.ini

mkdir -p /dev/net
mknod /dev/net/tun c 10 200
chown _lokinet /dev/net/tun

exec "$@"