// import * as cdk from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import * as lambda from 'aws-cdk-lib/aws-lambda';
// import * as s3 from 'aws-cdk-lib/aws-s3';
// import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
// import * as rds from 'aws-cdk-lib/aws-rds';
// import * as iam from 'aws-cdk-lib/aws-iam';
// import * as ec2 from 'aws-cdk-lib/aws-ec2';

// interface DatabaseUpdaterStackProps extends cdk.StackProps {
//     vpcId: string;
//     bucket: s3.IBucket;
//     databaseSecretKey: string;
//     databaseSecurityGroup: string;
// }

// export class DatabaseUpdaterStack extends cdk.Stack {
//     constructor(scope: Construct, id: string, props: DatabaseUpdaterStackProps) {
//         super(scope, id, props);

//         const { vpcId, bucket, databaseSecretKey, databaseSecurityGroup } = props;

//         const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
//             vpcId: vpcId,
//         });

//         const lambadaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
//             vpc,
//             description: 'Allows Database Updater Lambda function to connect to the RDS database',
//         });

//         lambadaSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow Lambda to access Secrets Manager');
//         lambadaSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(1433), 'Allow Lambda to connect to RDS database');


//         const secret = secretsmanager.Secret.fromSecretNameV2(this, 'RdsSecret', databaseSecretKey);

//         const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'SecurityGroup', databaseSecurityGroup);


//         securityGroup.addIngressRule(lambadaSecurityGroup, ec2.Port.tcp(1433), 'Allow Lambda to connect to RDS database');





//         // Lambda function to update the database
//         const databaseUpdaterFunction = new lambda.Function(this, 'DatabaseUpdaterFunction', {
//             runtime: lambda.Runtime.NODEJS_22_X,
//             handler: 'index.handler',
//             code: lambda.Code.fromAsset('lambda/database-updater'),
//             environment: {
//                 BUCKET_NAME: bucket.bucketName,
//                 SECRET_ARN: secret.secretArn,
//                 DATABASE_ENDPOINT: databaseInstance.dbInstanceEndpointAddress,
//                 DATABASE_PORT: databaseInstance.dbInstanceEndpointPort,
//             },
//         });

//         // Grant the Lambda function permissions to access the S3 bucket
//         bucket.grantReadWrite(databaseUpdaterFunction);

//         // Grant the Lambda function permissions to access the Secrets Manager secret
//         secret.grantRead(databaseUpdaterFunction);

//         // Grant the Lambda function permissions to connect to the database
//         databaseInstance.connections.allowDefaultPortFrom(databaseUpdaterFunction);

//         // Add necessary IAM policies to the Lambda function
//         databaseUpdaterFunction.addToRolePolicy(new iam.PolicyStatement({
//             actions: [
//                 'rds-db:connect',
//             ],
//             resources: [databaseInstance.instanceArn],
//         }));
//     }
// }