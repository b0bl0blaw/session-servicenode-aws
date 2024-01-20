#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SessionStack } from "../lib/session-stack";

const app = new cdk.App();

let instanceCount;
try {
  instanceCount = Number(app.node.getContext("INSTANCE_COUNT"));
} catch (Error) {
  instanceCount = 1;
}

new SessionStack(app, "SessionStack", instanceCount, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Israel region (testing)
new SessionStack(app, "SessionStack-il-central-1-1", instanceCount, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "il-central-1",
  },
});
