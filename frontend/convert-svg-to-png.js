import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#38bdf8;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0ea5e9;stop-opacity:1" />
    </linearGradient>
    <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.1"/>
    </pattern>
  </defs>
  
  <rect width="512" height="512" fill="#071828"/>
  <rect width="512" height="512" fill="url(#gridPattern)"/>
  
  <rect x="4" y="4" width="12" height="12" fill="#38bdf8"/>
  <rect x="496" y="4" width="12" height="12" fill="#38bdf8"/>
  <rect x="4" y="496" width="12" height="12" fill="#38bdf8"/>
  <rect x="496" y="496" width="12" height="12" fill="#38bdf8"/>
  
  <g transform="translate(85, 60)">
    <path d="M171 20 C171 20 256 50 256 120 L256 210 C256 260 210 310 171 325 C132 310 86 260 86 210 L86 120 C86 50 171 20 171 20 Z" 
          fill="url(#shieldGradient)" stroke="#38bdf8" stroke-width="3"/>
    
    <ellipse cx="135" cy="140" rx="35" ry="40" fill="white"/>
    <ellipse cx="207" cy="140" rx="35" ry="40" fill="white"/>
    <circle cx="140" cy="145" r="18" fill="#071828"/>
    <circle cx="212" cy="145" r="18" fill="#071828"/>
    <circle cx="133" cy="138" r="6" fill="white"/>
    <circle cx="205" cy="138" r="6" fill="white"/>
    
    <ellipse cx="171" cy="195" rx="15" ry="8" fill="#071828"/>
  </g>
  
  <g transform="translate(330, 280)">
    <circle cx="50" cy="50" r="35" fill="none" stroke="#38bdf8" stroke-width="6"/>
    <line x1="75" y1="75" x2="105" y2="105" stroke="#38bdf8" stroke-width="6" stroke-linecap="round"/>
  </g>
  
  <g stroke="#38bdf8" stroke-width="2" fill="none" opacity="0.4">
    <path d="M50 150 L80 150 L80 180 L120 180"/>
    <path d="M390 150 L360 150 L360 180 L320 180"/>
    <path d="M50 360 L80 360 L80 330 L120 330"/>
    <path d="M390 360 L360 360 L360 330 L320 330"/>
  </g>
  
  <g transform="translate(206, 380)">
    <rect x="0" y="0" width="100" height="45" rx="8" fill="#38bdf8"/>
    <text x="50" y="32" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#071828" text-anchor="middle">GO</text>
  </g>
</svg>`;

async function convertSvgToPng() {
  try {
    const canvas = createCanvas(512, 512);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#071828';
    ctx.fillRect(0, 0, 512, 512);
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 512; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
    
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(4, 4, 12, 12);
    ctx.fillRect(496, 4, 12, 12);
    ctx.fillRect(4, 496, 12, 12);
    ctx.fillRect(496, 496, 12, 12);
    
    ctx.save();
    ctx.translate(85, 60);
    
    ctx.beginPath();
    ctx.moveTo(171, 20);
    ctx.bezierCurveTo(171, 20, 256, 50, 256, 120);
    ctx.lineTo(256, 210);
    ctx.bezierCurveTo(256, 260, 210, 310, 171, 325);
    ctx.bezierCurveTo(132, 310, 86, 260, 86, 210);
    ctx.lineTo(86, 120);
    ctx.bezierCurveTo(86, 50, 171, 20, 171, 20);
    ctx.closePath();
    
    const gradient = ctx.createLinearGradient(86, 20, 256, 325);
    gradient.addColorStop(0, '#38bdf8');
    gradient.addColorStop(1, '#0ea5e9');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(135, 140, 35, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(207, 140, 35, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#071828';
    ctx.beginPath();
    ctx.arc(140, 145, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(212, 145, 18, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(133, 138, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(205, 138, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#071828';
    ctx.beginPath();
    ctx.ellipse(171, 195, 15, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    
    ctx.save();
    ctx.translate(330, 280);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(50, 50, 35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(75, 75);
    ctx.lineTo(105, 105);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(50, 150);
    ctx.lineTo(80, 150);
    ctx.lineTo(80, 180);
    ctx.lineTo(120, 180);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(390, 150);
    ctx.lineTo(360, 150);
    ctx.lineTo(360, 180);
    ctx.lineTo(320, 180);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 360);
    ctx.lineTo(80, 360);
    ctx.lineTo(80, 330);
    ctx.lineTo(120, 330);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(390, 360);
    ctx.lineTo(360, 360);
    ctx.lineTo(360, 330);
    ctx.lineTo(320, 330);
    ctx.stroke();
    ctx.globalAlpha = 1;
    
    ctx.save();
    ctx.translate(206, 380);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(0, 0, 100, 45, 8);
    ctx.fill();
    ctx.fillStyle = '#071828';
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GO', 50, 22);
    ctx.restore();
    
    const buffer = canvas.toBuffer('image/png');
    const outputPath = path.join(process.cwd(), 'public', 'logo_godeepaudit.png');
    fs.writeFileSync(outputPath, buffer);
    console.log('PNG file generated successfully at:', outputPath);
  } catch (error) {
    console.error('Error converting SVG to PNG:', error);
  }
}

convertSvgToPng();
