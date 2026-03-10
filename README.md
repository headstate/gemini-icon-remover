# Gemini Icon Remover

A client-side web application for removing Gemini AI watermarks from images. This tool uses advanced inpainting algorithms to seamlessly remove the Gemini "G" logo and other watermarks from AI-generated images.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Web-brightgreen.svg)
![Dependencies](https://img.shields.io/badge/dependencies-None-success.svg)

## Features

- **Auto-detect mode**: Automatically detects and removes watermarks in image corners
- **Manual mode**: Draw on the image to mark specific areas for removal
- **Undo/Redo**: Full history management for non-destructive editing
- **Client-side processing**: Your images never leave your browser
- **Responsive design**: Works on desktop and mobile devices
- **Dark mode UI**: Easy on the eyes for image editing tasks

## How to Use

### 1. Upload an Image

- Drag and drop an image onto the upload area, or
- Click "browse" to select a file from your computer

Supported formats: JPG, PNG, WEBP

### 2. Choose a Mode

**Auto Mode** (default):
- The tool will automatically scan the corners of your image
- It detects potential watermark regions based on edge density and color patterns
- Click "Remove Icon" to process

**Manual Mode**:
- Select "Manual" from the toolbar
- Adjust brush size as needed
- Draw on the image to mark the watermark area
- Click "Remove Icon" to process

### 3. Download Your Image

Once processing is complete, click "Download" to save your watermark-free image as a PNG file.

### Additional Controls

- **Undo/Redo**: Revert or reapply changes
- **Reset**: Restore the original image
- **New Image**: Upload a different image

## How the Inpainting Algorithm Works

The tool uses a **patch-based inpainting algorithm** inspired by the Exemplar-Based Image Inpainting method. Here's how it works:

### 1. Region Detection

In auto mode, the algorithm analyzes each corner of the image looking for:
- **Edge density**: Watermarks typically have distinct edges
- **Color variance**: Logos often have lower color variance than natural images
- **Contrast patterns**: Text and logos create high-contrast edges

### 2. Priority Calculation

For each pixel on the boundary of the region to be filled:

```
Priority = Confidence × Data Term
```

- **Confidence**: Based on how many known pixels surround the target
- **Data Term**: Based on the strength of gradients (edges) near the boundary

Pixels with higher priority are filled first, ensuring structural continuity.

### 3. Patch Matching

For each target pixel:
1. Extract a small patch (9×9 pixels) around the target
2. Search the known region for similar patches
3. Find the patch with minimum Sum of Squared Differences (SSD)
4. Copy the matching patch to fill the unknown region

### 4. Iterative Filling

The algorithm repeats the priority calculation and patch matching until:
- All pixels are filled, or
- Maximum iterations reached (500)

### 5. Quick Inpainting (Optimization)

For small regions (< 5% of image), a faster diffusion-based method is used:
- Each unknown pixel is filled with a weighted average of its neighbors
- The process iterates 100-200 times
- Much faster than patch-based method for small watermarks

## Deployment to Cloudflare Pages

### Option 1: Direct Upload

1. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
2. Click "Create a project"
3. Select "Direct Upload"
4. Give your project a name (e.g., "gemini-icon-remover")
5. Click "Create project"
6. Drag and drop all files from this folder:
   ```
   gemini-icon-remover/
   ├── index.html
   ├── css/
   │   └── style.css
   ├── js/
   │   ├── app.js
   │   └── inpainter.js
   └── README.md
   ```
7. Click "Deploy site"

### Option 2: Git Integration

1. Push this code to a GitHub or GitLab repository
2. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
3. Click "Create a project"
4. Select "Connect to Git"
5. Choose your repository
6. Configure build settings:
   - **Build command**: (leave empty)
   - **Build output directory**: `/`
7. Click "Save and Deploy"

### Custom Domain (Optional)

1. In your Cloudflare Pages dashboard, go to "Custom domains"
2. Click "Set up a custom domain"
3. Enter your domain name
4. Follow the DNS configuration instructions

## File Structure

```
gemini-icon-remover/
├── index.html          # Main HTML structure
├── css/
│   └── style.css       # Dark mode styles and responsive design
├── js/
│   ├── app.js          # Main application logic and UI
│   └── inpainter.js    # Inpainting algorithm implementation
└── README.md           # This file
```

## Technical Details

### Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13.1+
- Edge 80+

### Performance

- Images are automatically resized to max 2048×2048 for optimal performance
- Processing time depends on image size and watermark region:
  - Small watermarks: 1-3 seconds
  - Large regions: 5-15 seconds
- Uses Web Workers-friendly code (can be extended for background processing)

### Limitations

- Best results with small watermarks in corners
- Complex backgrounds may show slight artifacts
- Very large watermarks may require multiple passes
- Does not work on heavily compressed or low-quality images

## Tips for Best Results

1. **Use high-quality images**: Better input = better output
2. **Try auto mode first**: It works well for most Gemini watermarks
3. **Use manual mode for precision**: When auto-detection fails
4. **Mark slightly larger area**: Include a few pixels around the watermark
5. **Multiple passes**: For stubborn watermarks, process multiple times

## Privacy & Security

- **100% client-side**: All processing happens in your browser
- **No data sent**: Your images are never uploaded to any server
- **No tracking**: No analytics or tracking scripts
- **Open source**: You can verify the code yourself

## License

MIT License - feel free to use, modify, and distribute.

## Credits

- Inpainting algorithm based on research in exemplar-based image completion
- UI design inspired by modern image editing tools
- Built with vanilla JavaScript and HTML5 Canvas API

## Contributing

Contributions are welcome! Areas for improvement:

- Better watermark detection algorithms
- Additional inpainting methods
- Performance optimizations
- UI/UX enhancements
- Mobile experience improvements

---

**Note**: This tool is for educational and personal use. Please respect copyright and only remove watermarks from images you have the right to modify.
