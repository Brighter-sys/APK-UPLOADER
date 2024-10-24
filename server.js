const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dir = './uploads';
        if (file.fieldname.startsWith('screenshot')) {
            dir = './uploads/screenshots';
        } else if (file.fieldname === 'icon') {
            dir = './uploads/icons';
        }
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        crypto.randomBytes(16, (err, buf) => {
            if (err) return cb(err);
            const filename = buf.toString('hex') + path.extname(file.originalname);
            cb(null, filename);
        });
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'apk' && path.extname(file.originalname) !== '.apk') {
            return cb(new Error('Only APK files are allowed'));
        }
        if (file.fieldname === 'icon' && !file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed for icons'));
        }
        if (file.fieldname.startsWith('screenshot') && !file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed for screenshots'));
        }
        cb(null, true);
    }
}).fields([
    { name: 'apk', maxCount: 1 },
    { name: 'icon', maxCount: 1 },
    { name: 'screenshot0', maxCount: 1 },
    { name: 'screenshot1', maxCount: 1 },
    { name: 'screenshot2', maxCount: 1 },
    { name: 'screenshot3', maxCount: 1 }
]);

// Get list of files
app.get('/files', (req, res) => {
    try {
        const fileList = JSON.parse(fs.readFileSync('./uploads/files.json', 'utf8') || '[]');
        res.json(fileList);
    } catch (error) {
        console.error('Error reading files:', error);
        res.status(500).json({ error: 'Failed to read files' });
    }
});

// Upload route
app.post('/upload', (req, res) => {
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            return res.status(500).json({ error: err.message });
        } else if (err) {
            console.error('Unknown error:', err);
            return res.status(500).json({ error: 'An unknown error occurred' });
        }
        try {
            if (!req.files?.apk?.[0]) {
                return res.status(400).json({ error: 'No APK file uploaded' });
            }
            const apkFile = req.files.apk[0];
            const iconFile = req.files.icon?.[0];
            const screenshots = Object.keys(req.files)
                .filter(key => key.startsWith('screenshot'))
                .map(key => `/uploads/screenshots/${req.files[key][0].filename}`);
            const fileInfo = {
                id: apkFile.filename,
                originalName: apkFile.originalname,
                size: apkFile.size,
                uploadDate: new Date().toISOString(),
                icon: iconFile ? `/uploads/icons/${iconFile.filename}` : null,
                screenshots: screenshots
            };
            let fileList;
            try {
                fileList = JSON.parse(fs.readFileSync('./uploads/files.json', 'utf8') || '[]');
            } catch (error) {
                console.error('Error reading files.json:', error);
                fileList = [];
            }
            fileList.push(fileInfo);
            try {
                fs.writeFileSync('./uploads/files.json', JSON.stringify(fileList));
            } catch (error) {
                console.error('Error writing to files.json:', error);
                return res.status(500).json({ error: 'Failed to save file information' });
            }
            res.json(fileInfo);
        } catch (error) {
            console.error('Unexpected error in /upload route:', error);
            res.status(500).json({ error: 'An unexpected error occurred' });
        }
    });
});

// Download route
app.get('/download/:id', (req, res) => {
    const fileId = req.params.id;
    let fileList;
    
    try {
        const fileData = fs.readFileSync('./uploads/files.json', 'utf8');
        fileList = JSON.parse(fileData || '[]');
    } catch (error) {
        console.error('Error reading files.json:', error);
        return res.status(500).json({ error: 'Failed to read file information' });
    }

    const fileInfo = fileList.find(file => file.id === fileId);

    if (!fileInfo) {
        return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(__dirname, 'uploads', fileId);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found on server: ${filePath}`);
        return res.status(404).json({ error: 'File not found on server' });
    }

    res.download(filePath, fileInfo.originalName, (err) => {
        if (err) {
            console.error('Error during file download:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to download file' });
            }
        }
    });
});

// Delete route
app.delete('/delete/:id', (req, res) => {
    const fileId = req.params.id;
    const filePath = path.join(__dirname, 'uploads', fileId);

    console.log('Checking file existence:', filePath);
    if (!fs.existsSync(filePath)) {
        console.log('File does not exist on the server');
        return res.status(404).json({ error: 'File not found on server' });
    }

    let fileList;
    try {
        fileList = JSON.parse(fs.readFileSync('./uploads/files.json', 'utf8') || '[]');
        console.log('Current file list:', fileList.map(file => file.id));
    } catch (error) {
        console.error('Error reading files.json:', error);
        return res.status(500).json({ error: 'Failed to read file information' });
    }

    const fileIndex = fileList.findIndex(file => file.id === fileId);

    if (fileIndex === -1) {
        return res.status(404).json({ error: 'File not found' });
    }

    const fileInfo = fileList[fileIndex];

    // Delete the APK file
    try {
        fs.unlinkSync(filePath);
    } catch (error) {
        console.error('Error deleting APK file:', error);
        return res.status(500).json({ error: 'Failed to delete APK file' });
    }

    // Delete the icon if it exists
    if (fileInfo.icon) {
        const iconPath = path.join(__dirname, fileInfo.icon.slice(1)); // Remove leading '/'
        try {
            fs.unlinkSync(iconPath);
        } catch (error) {
            console.error('Error deleting icon file:', error);
        }
    }

    // Delete screenshots if they exist
    if (fileInfo.screenshots) {
        fileInfo.screenshots.forEach(screenshot => {
            const screenshotPath = path.join(__dirname, screenshot.slice(1)); // Remove leading '/'
            try {
                fs.unlinkSync(screenshotPath);
            } catch (error) {
                console.error('Error deleting screenshot file:', error);
            }
        });
    }

    // Remove the file info from the list
    fileList.splice(fileIndex, 1);

    // Update the files.json
    try {
        fs.writeFileSync('./uploads/files.json', JSON.stringify(fileList));
    } catch (error) {
        console.error('Error updating files.json:', error);
        return res.status(500).json({ error: 'Failed to update file information' });
    }

    res.json({ message: 'File deleted successfully' });
});

// Ensure directories exist
const dirs = ['./uploads', './uploads/screenshots', './uploads/icons'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (error) {
            console.error(`Failed to create directory ${dir}:`, error);
        }
    }
});

// Ensure files.json exists
if (!fs.existsSync('./uploads/files.json')) {
    try {
        fs.writeFileSync('./uploads/files.json', '[]');
    } catch (error) {
        console.error('Failed to create files.json:', error);
    }
}

// Add this after all your other routes, but before app.listen()
app.use((req, res, next) => {
    console.log(`Unmatched route: ${req.method} ${req.url}`);
    next();
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

app.get('/debug/files', (req, res) => {
    try {
        const fileList = JSON.parse(fs.readFileSync('./uploads/files.json', 'utf8') || '[]');
        res.json(fileList);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read files.json' });
    }
});
