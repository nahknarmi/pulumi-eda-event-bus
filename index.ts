import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import {BucketObject} from "@pulumi/aws/s3";
import {FileAsset} from "@pulumi/pulumi/asset";

// Create an AWS resource (S3 Bucket)
const bucket = new aws.s3.Bucket("my-bucket", {
    website: {
        indexDocument: "index.html"
    }
});

// Export the name of the bucket
export const bucketName = bucket.id;


new BucketObject("index.html", {
    acl: "public-read",
    contentType: "text/html",
    bucket: bucket,
    source: new FileAsset("index.html")
})

export const bucketEndpoint = pulumi.interpolate`http://${bucket.websiteEndpoint}`;