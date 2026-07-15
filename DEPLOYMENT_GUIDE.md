# 🚀 GocampuX Deployment Guide

## Quick Start

### Step 1: Get API Keys

Choose your AI provider:

#### Option A: Gemini (Recommended)
1. Go to [Google AI Studio](https://ai.google.dev/)
2. Click "Get API Key"
3. Create a new API key
4. Copy the key

#### Option B: Anthropic
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an API key
3. Copy the key

#### Option C: OpenAI
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Copy the key

### Step 2: Deploy to Vercel

1. **Fork the repository**
   - Go to https://github.com/Kempegowda77/gocampuX
   - Click "Fork"

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Select your forked repository
   - Click "Import"

3. **Set Environment Variables**
   - In Vercel Dashboard, go to "Settings" → "Environment Variables"
   - Add the following variables:

   **For Gemini:**
   ```
   AI_PROVIDER = gemini
   GEMINI_API_KEY = your_gemini_api_key_here
   NODE_ENV = production
   ```

   **For Anthropic:**
   ```
   AI_PROVIDER = anthropic
   ANTHROPIC_API_KEY = your_anthropic_api_key_here
   ANTHROPIC_MODEL = claude-opus-4-8
   NODE_ENV = production
   ```

   **For OpenAI:**
   ```
   AI_PROVIDER = openai
   OPENAI_API_KEY = your_openai_api_key_here
   OPENAI_MODEL = gpt-4o-mini
   NODE_ENV = production
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete
   - Your app is now live! 🎉

## Verify Deployment

### Check Health Endpoint

```bash
curl https://your-app.vercel.app/api/health

Expected response:
{
  "status": "ok",
  "provider": "gemini",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Test Chat Endpoint

```bash
curl -X POST https://your-app.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
```

## Common Issues

### Issue: "Bot not giving output"

**Cause**: API key not set or invalid

**Solution**:
1. Check Vercel dashboard → Settings → Environment Variables
2. Verify `AI_PROVIDER` and API key are set
3. Ensure the API key is valid and has quota
4. Redeploy after changes

### Issue: "500 Internal Server Error"

**Cause**: Missing required environment variables

**Solution**:
1. Go to Vercel Deployments
2. Click on the failing deployment
3. Check the logs tab for error messages
4. Add missing environment variables
5. Redeploy

### Issue: "CORS error"

**Cause**: Frontend trying to call API from different origin

**Solution**: This is automatically handled. The app uses relative URLs.

## Optional: SMS OTP Setup

To enable SMS verification via Twilio:

1. **Create Twilio Account**
   - Go to [twilio.com](https://www.twilio.com/)
   - Sign up for free

2. **Get Credentials**
   - Account SID
   - Auth Token
   - Phone Number

3. **Add to Vercel**
   - In Environment Variables, add:
   ```
   TWILIO_ACCOUNT_SID = your_account_sid
   TWILIO_AUTH_TOKEN = your_auth_token
   TWILIO_PHONE_NUMBER = +1234567890
   ```

4. **Redeploy**
   - Vercel will automatically redeploy

## Monitoring

### View Logs

```bash
# Using Vercel CLI
vercel logs

# Or in Vercel Dashboard:
# 1. Go to your project
# 2. Click "Deployments"
# 3. Select latest deployment
# 4. Click "Logs" tab
```

### Check Performance

- Vercel Dashboard → Analytics
- Check response times and error rates
- Monitor API usage

## Scaling

For high traffic:

1. **Upgrade Vercel Plan**
   - Go to Settings → Upgrade
   - Choose "Pro" or "Enterprise"

2. **Increase API Quotas**
   - Gemini: https://ai.google.dev/
   - OpenAI: https://platform.openai.com/
   - Anthropic: https://console.anthropic.com/

3. **Add Caching**
   - Already implemented in code
   - Response cache: 30 minutes
   - OTP cache: 5 minutes

## Next Steps

1. ✅ Test the app: https://your-app.vercel.app
2. ✅ Try different AI providers
3. ✅ Set up SMS OTP (optional)
4. ✅ Configure Firebase (optional)
5. ✅ Invite users

## Need Help?

- Check logs: `vercel logs`
- Verify environment variables
- Test health endpoint
- Check API quota in provider dashboard

---

**Happy deploying! 🚀**
