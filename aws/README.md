# AWS deployment and private media checklist

SmartHire supports S3-backed Django `FileField` storage when `USE_S3=True`. This configures storage only; it does not automatically provision AWS infrastructure or deploy the web app.

## Recommended production shape

- **Compute:** ECS Fargate or EC2 running the backend container; serve the React build from a static host such as S3 + CloudFront or Amplify.
- **Database:** private Amazon RDS for PostgreSQL, not a public database endpoint.
- **Media:** private S3 bucket with Block Public Access enabled, bucket-owner-enforced object ownership, default encryption (SSE-S3 or SSE-KMS), and lifecycle/retention policy.
- **Secrets:** Secrets Manager or SSM Parameter Store; never commit `.env` or put server secrets in `VITE_*` variables.
- **Permissions:** prefer an EC2/ECS IAM role with only `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` on the app's bucket/prefix. Do not grant public ACLs or `s3:*` on `*`.
- **Network:** RDS in private subnets; allow database traffic only from the app security group; use HTTPS at the load balancer/reverse proxy.
- **Operations:** CloudWatch logs/alarms, automated database backups, S3 lifecycle expiration, and a documented candidate-data deletion process.

## Backend environment

Set these on the backend service (use a secure secret manager in production):

```env
DEBUG=False
USE_SQLITE=False
DB_NAME=smarthire
DB_USER=smarthire_app
DB_PASSWORD=<secret>
DB_HOST=<private-rds-endpoint>
DB_PORT=5432
ALLOWED_HOSTS=<api-domain>
CORS_ALLOWED_ORIGINS=https://<frontend-domain>
CSRF_TRUSTED_ORIGINS=https://<api-domain>
SECRET_KEY=<unique-random-secret-at-least-50-characters>
USE_S3=True
AWS_STORAGE_BUCKET_NAME=<private-bucket-name>
AWS_S3_REGION_NAME=ap-south-1
```

For ECS/EC2, attach a least-privilege IAM role and leave `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` blank. Local development may use a dedicated IAM user only if necessary; never use root account keys. Keep the bucket private; the app uses short-lived signed URLs for authorized file access.

Set `EMAIL_NOTIFICATIONS_ENABLED=True` and SMTP environment variables only after verifying your mail provider. Set `GOOGLE_OAUTH_CLIENT_ID` on the backend and `VITE_GOOGLE_CLIENT_ID` at frontend build time if enabling Google sign-in; both IDs must refer to the same Google OAuth web client. Add the production frontend domain to the Google OAuth authorized JavaScript origins.

## Deployment order

1. Create the VPC/network and private RDS database.
2. Create a private S3 bucket; block public access and enable encryption.
3. Attach the narrow S3 policy to the backend task/instance role.
4. Store production environment variables in Secrets Manager/SSM.
5. Build and deploy the backend container, then run `python manage.py migrate` as a release step.
6. Build the frontend with `VITE_API_URL=https://<api-domain>/api` and (optional) `VITE_GOOGLE_CLIENT_ID`.
7. Configure HTTPS, CORS/CSRF, health checks, logs, alerts, backups, and deletion/retention policies.
8. Run the acceptance checklist in the root README before handling real candidate data.

AWS resources can incur charges. This repository does not create billable infrastructure automatically.
