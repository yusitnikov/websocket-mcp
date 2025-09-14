import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from dist directory (for production)
app.use(express.static(path.join(__dirname, 'dist')));

// API Routes for demo purposes
app.get('/api/demo', (req, res) => {
  res.json({
    message: 'Hello from Express server!',
    timestamp: new Date().toISOString(),
    random: Math.floor(Math.random() * 1000)
  });
});

app.get('/api/users', (req, res) => {
  const users = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
    { id: 3, name: 'Bob Johnson', email: 'bob@example.com' }
  ];
  res.json(users);
});

app.post('/api/data', (req, res) => {
  console.log('Received POST data:', req.body);
  res.json({
    success: true,
    received: req.body,
    processed_at: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Catch-all handler: send back index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Available API endpoints:');
  console.log('  GET  /api/demo');
  console.log('  GET  /api/users');
  console.log('  POST /api/data');
  console.log('  GET  /api/health');
});