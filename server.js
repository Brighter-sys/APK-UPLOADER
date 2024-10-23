const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        crypto.randomBytes(16, (err, buf) => {
            if (err) return cb(err);
            cb(null, buf.toString('hex') + path.extname(file.originalname));
        });
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname) !== '.apk') {
            return cb(new Error('Only APK files are allowed'));
        }
        cb(null, true);
    }
});

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Routes
app.post('/upload', upload.single('apk'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileInfo = {
        id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        uploadDate: new Date().toISOString()
    };

    // Store file info in a JSON file
    const fileList = JSON.parse(fs.readFileSync('./uploads/files.json', 'utf8') || '[]');
    fileList.push(fileInfo);
    fs.writeFileSync('./uploads/files.json', JSON.stringify(fileList));

    res.json(fileInfo);
});

app.get('/files', (req, res) => {
    const fileList = JSON.parse(fs.readFileSync('./uploads/files.json', 'utf8') || '[]');
    res.json(fileList);
});

app.get('/download/:fileId', (req, res) => {
    const fileList = JSON.parse(fs.readFileSync('./uploads/files.json', 'utf8') || '[]');
    const file = fileList.find(f => f.id === req.params.fileId);

    if (!file) {
        return res.status(404).send('File not found');
    }

    res.download(path.join(__dirname, 'uploads', file.id), file.originalName);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}
if (!fs.existsSync('./uploads/files.json')) {
    fs.writeFileSync('./uploads/files.json', '[]');
}
