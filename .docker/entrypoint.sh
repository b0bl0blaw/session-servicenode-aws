#!/bin/bash
set -eo pipefail

MIN_SIZE=15000000000  # 15GB
DATA_FILE_PATH="/efs/session-node/lmdb/data.mdb"

if [ -e "$DATA_FILE_PATH" ] && [ "$(stat -c %s "$DATA_FILE_PATH")" -gt $MIN_SIZE ]; then
    echo "We have a decent chunk of lmdb, falling back to oxend sync."
else
    aws s3 cp s3://session-lmdb-backups/ons.db /efs/session-node/
    aws s3 cp s3://session-lmdb-backups/ons.db-shm /efs/session-node/
    aws s3 cp s3://session-lmdb-backups/ons.db-wal /efs/session-node/
    aws s3 cp s3://session-lmdb-backups/sqlite.db /efs/session-node/
    aws s3 cp s3://session-lmdb-backups/sqlite.db-shm /efs/session-node/
    aws s3 cp s3://session-lmdb-backups/sqlite.db-wal /efs/session-node/
    aws s3 cp s3://session-lmdb-backups/data.mdb /efs/session-node/lmdb/
fi

if [ -n "$AS_FARGATE" ] && [ "$AS_FARGATE" = true ]; then
  TASK_ARN=$(aws ecs list-tasks --cluster "$ECS_CLUSTER_NAME" --service-name "$ECS_SERVICE_NAME" --query 'taskArns[0]' --output text)
  TASK_DETAILS=$(aws ecs describe-tasks --cluster "$ECS_CLUSTER_NAME" --task "${TASK_ARN}" --query 'tasks[0].attachments[0].details')
  ENI=$(echo "$TASK_DETAILS" | jq -r '.[] | select(.name=="networkInterfaceId").value')
  PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids "${ENI}" --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
else
  TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
  PUBLIC_IP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
fi

echo "Using public IP address: ${PUBLIC_IP}"

exec "$@" --service-node-public-ip "${PUBLIC_IP}"