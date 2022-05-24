import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import {BucketObject} from "@pulumi/aws/s3";
import {FileAsset} from "@pulumi/pulumi/asset";


// Create an AWS resource (S3 Bucket)
const fileLandingZone = new aws.s3.Bucket("file-landing-zone", {
});

// Export the name of the bucket
export const bucketName = fileLandingZone.id;

// When a new thumbnail is created, log a message.
fileLandingZone.onObjectCreated("onNewDepositoryFile", new aws.lambda.CallbackFunction<aws.s3.BucketEvent, void>("onNewDepositoryFile", {
    callback: async bucketArgs => {
        console.log("onNewDepositoryFile called");
        if (!bucketArgs.Records) {
            return;
        }

        for (const record of bucketArgs.Records) {
            console.log(`*** New Depository: file ${record.s3.object.key} was saved at ${record.eventTime}.`);
        }
    },
    policies: [
        aws.iam.ManagedPolicy.AWSLambdaExecute,                 // Provides wide access to Lambda and S3
    ],
}), { filterSuffix: ".csv" });
