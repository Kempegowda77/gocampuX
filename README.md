# 🤖 GocampuX - AI Chat Portal

A modern, production-ready AI chat application with multiple AI provider support, SMS OTP authentication, and real-time streaming responses.

## 🚀 Features

- **Multi-AI Provider Support**
  - Gemini (Default)
  - Anthropic Claude
  - OpenAI
  - OpenRouter
  - Groq

- **Advanced Features**
  - Real-time streaming responses
  - Web search grounding
  - Voice input (Speech-to-Text)
  - Text-to-speech output
  - File attachments & screenshots
  - Session management
  - Firebase integration (optional)
  - SMS OTP authentication via Twilio

- **Performance Optimizations**
  - Response caching
  - Low-bandwidth mode
  - Compression support
  - Connection pooling

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- One of the following AI API keys:
  - Gemini API key (recommended)
  - Anthropic API key
  - OpenAI API key
  - OpenRouter API key
  - Groq API key

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Kempegowda77/gocampuX.git
   cd gocampuX
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

4. **Configure your API keys in `.env.local`**
   ```env
   AI_PROVIDER="gemini"
   GEMINI_API_KEY="your_api_key_here"
   ```

5. **Run locally**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

## 🌐 Deployment

### Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git push origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Set environment variables in Vercel dashboard
   - Deploy!

### Environment Variables for Production

Set these in your Vercel project settings:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
NODE_ENV=production
APP_URL=https://your-app.vercel.app
```

## 📝 Configuration

### AI Provider Selection

Set `AI_PROVIDER` to one of:
- `gemini` (default)
- `anthropic`
- `openai`
- `openrouter`
- `groq`

### Optional: Twilio SMS OTP

For SMS authentication:

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### Optional: Firebase

For cloud session storage:

```env
FIREBASE_API_KEY=your_key
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

## 🐛 Troubleshooting

### "Bot not giving output"

**Solution**: Ensure your API keys are configured correctly:

```bash
# Check local development
echo $GEMINI_API_KEY  # Should show your API key

# For Vercel, verify in Project Settings > Environment Variables
```

### "API endpoint errors"

**Solution**: The app automatically uses the correct API endpoints:
- Local: `http://localhost:3000/api/chat`
- Vercel: `https://your-app.vercel.app/api/chat`

No manual URL changes needed!

### "Connection timeouts"

**Solution**: 
- Check your network connection
- Verify API key is valid
- Check Vercel deployment logs: `vercel logs`

## 📁 Project Structure

```
gocampuX/
├── src/
│   ├── config/        # Configuration (API endpoints, providers)
│   ├── services/      # API services (chat, OTP)
│   ├── components/    # React components
│   ├── lib/           # Utilities (Firebase, AI providers)
│   ├── App.tsx        # Main app component
│   └── main.tsx       # Entry point
├── server.ts          # Express server
├── package.json       # Dependencies
├── vite.config.ts     # Vite config
├── tsconfig.json      # TypeScript config
└── .env.example       # Example env variables
```

## 🔐 Security

- API keys never exposed to frontend
- OTP codes validated server-side
- CORS properly configured
- Rate limiting on OTP requests
- Input validation on all endpoints
- HTTPS enforced in production

## 📊 API Endpoints

### Chat
```
POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "model": "gemini-3.5-flash",
  "stream": true,
  "useWebSearch": false
}
```

### OTP Send
```
POST /api/otp/send
Content-Type: application/json

{
  "phoneNumber": "+1234567890"
}
```

### OTP Verify
```
POST /api/otp/verify
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "code": "123456"
}
```

### Health Check
```
GET /api/health

Response:
{
  "status": "ok",
  "provider": "gemini",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 💬 Support

For issues and questions:
- Check [Troubleshooting](#-troubleshooting) section
- Open an [issue on GitHub](https://github.com/Kempegowda77/gocampuX/issues)
- Check deployment logs on Vercel dashboard

## 🎯 Future Enhancements

- [ ] Plugin system for custom AI providers
- [ ] Advanced analytics and insights
- [ ] Collaborative chat sessions
- [ ] Custom model fine-tuning
- [ ] Mobile app (React Native)
- [ ] Desktop app (Electron)

---

**Built with ❤️ for the AI community**

Live Demo: https://gocampu-x.vercel.app
