#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SessionStack } from "../lib/session-stack";

const app = new cdk.App();
new SessionStack(app, "SessionStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new SessionStack(app, "SessionStack-il-central-1-1", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "il-central-1",
  },
});
