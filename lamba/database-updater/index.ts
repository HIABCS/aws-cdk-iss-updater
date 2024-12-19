import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { S3 } from '@aws-sdk/client-s3';
import { ConnectionPool } from 'mssql';
import { Readable } from 'stream';

export const handler = async (): Promise<any> => {
    console.log('Lambda function started.');

    const secretsManager = new SecretsManager();
    const s3 = new S3();

    try {
        console.log('Fetching RDS credentials from Secrets Manager...');
        const secretName = process.env.SECRET_NAME!;
        const secretData = await secretsManager.getSecretValue({ SecretId: secretName });
        const dbCredentials = JSON.parse(secretData.SecretString!);
        console.log('Successfully fetched RDS credentials.');

        console.log('Downloading SQL migration script from S3...');
        const bucketName = process.env.BUCKET_NAME!;
        const scriptKey = process.env.SCRIPT_KEY!;
        const scriptData = await s3.getObject({ Bucket: bucketName, Key: scriptKey });
        const sqlScript = await streamToString(scriptData.Body as Readable);
        console.log('Successfully downloaded SQL migration script.');

        console.log('Connecting to RDS database...');
        const pool = new ConnectionPool({
            user: dbCredentials.username,
            password: dbCredentials.password,
            server: dbCredentials.host,
            database: dbCredentials.database,
            port: parseInt(process.env.RDS_PORT!),
            options: {
                encrypt: true,
                enableArithAbort: true,
            },
        });

        await pool.connect();
        console.log('Connected to the database.');

        console.log('Executing SQL migration script...');
        const result = await pool.request().query(sqlScript);
        console.log('Migration executed successfully:', result);

        return { status: 'success', message: 'Migrations applied successfully', result };

    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('An error occurred:', error.message);
            console.error('Stack trace:', error.stack);
            throw new Error(`Migration failed: ${error.message}`);
        } else {
            console.error('An unexpected non-error occurred:', error);
            throw new Error('Migration failed: Unknown error');
        }
    }
};

// Utility function to convert Readable stream to string
const streamToString = async (stream: Readable | null): Promise<string> => {
    if (!stream) {
        throw new Error('Stream is null or undefined.');
    }

    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', (err) => reject(err));
    });
};
