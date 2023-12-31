#!/bin/bash
set -eo pipefail

DATA_FILE_PATH="/efs/session-node/lmdb/data.mdb"

while [ ! -e "$DATA_FILE_PATH" ]; do
    echo "LMDB not present, waiting to start storage server..."
    sleep 10
done

exec "$@"