# Credential Management

## Google Cloud Service Account Keys

This project uses Google Cloud Document AI which requires service account authentication. Follow these steps to set up your credentials:

1. **Never store service account keys in the repository**
   - Service account keys should be stored securely outside the project directory
   - The `.gitignore` file is configured to prevent accidental commits of key files

2. **Local Development Setup**
   - Store your service account key in a secure location outside the project
   - Example: `C:/Users/<your-username>/secure-credentials/google-cloud/`
   - Update your `.env` file to point to the key:
     ```env
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/key.json
     ```

3. **Production Environment**
   - Use your deployment platform's secret management system
   - Examples:
     - Vercel: Use Environment Variables
     - Docker: Use Docker Secrets
     - Kubernetes: Use Secrets
     - Cloud Run: Use mounted secrets

4. **Key Rotation**
   - Rotate service account keys every 90 days
   - Update all environments when rotating keys
   - Maintain a key rotation schedule in your team's security documentation

5. **Security Best Practices**
   - Use the principle of least privilege for service accounts
   - Monitor service account usage through Cloud Audit Logs
   - Regularly review and revoke unused service accounts
   - Use separate service accounts for development and production

## Environment Variables

This project uses the following environment variables for Google Cloud configuration:

```env
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_LOCATION=your-region
GOOGLE_CLOUD_PROCESSOR_ID=your-processor-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

Contact the project administrator for access to the necessary credentials. 