import express from 'express';
import cors from 'cors';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin (emulator mode handles credentials)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'demo-humanv1-admin'
  });
}

const app = express();
app.use(cors());
app.use(express.json());

// Middlewares for authentication and authorization would go here
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// For emulator testing
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Admin API listening on port ${PORT}`);
  });
}

export default app;
