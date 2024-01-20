#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SessionStack } from "../lib/session-stack";

const app = new cdk.App();

// Default region
const defaultRegionInstanceCount = 1;
new SessionStack(app, "SessionStack", defaultRegionInstanceCount, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Israel region
const israelRegionInstanceCount = 1;
new SessionStack(
  app,
  "SessionStack-il-central-1-1",
  israelRegionInstanceCount,
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: "il-central-1",
    },
  },
);

// More regions...
