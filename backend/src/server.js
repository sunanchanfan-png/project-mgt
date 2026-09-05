// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const projectsRoutes = require('./routes/projects');
const wbsLevel1Routes = require('./routes/wbsLevel1');
const wbsLevel2Routes = require('./routes/wbsLevel2');
const wbsLevel3Routes = require('./routes/wbsLevel3');
const wbsDependenciesRoutes = require('./routes/wbsDependencies');
const progressRoutes = require('./routes/progress');
const permissionsRoutes = require('./routes/permissions');
const reportsRoutes = require('./routes/reports');
const photosRoutes = require('./routes/photos');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Routes — เพิ่ม route ใหม่ตรงนี้เมื่อทำเมนูถัดไปเสร็จ
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/wbs-level1', wbsLevel1Routes);
app.use('/api/wbs-level2', wbsLevel2Routes);
app.use('/api/wbs-level3', wbsLevel3Routes);
app.use('/api/wbs-dependencies', wbsDependenciesRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/photos', photosRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'ไม่พบ endpoint นี้' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
