#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsCdkIssUpdaterStack } from '../lib/aws-cdk-iss-updater-stack';

const app = new cdk.App();

// cargotec-h-mcce-evo-functional-p
new AwsCdkIssUpdaterStack(app, 'EvoIssUpdater', {
    environment: "evo-functional-p",
    env: { account: '905418461703', region: 'eu-north-1' },
    applicationPool: 'EvoFunctional',
    iisPath: 'C:\\inetpub\\wwwroot\\EvoFunctional',
    ec2InstanceId: 'i-0c8a5d8f4d8a1c3c7',
    ec2RoleName: "EC2-EVO-FUNCTIONAL",
    crossAccountAccountId: '024295479209',
    artifactName: 'HiCommand.zip',
});