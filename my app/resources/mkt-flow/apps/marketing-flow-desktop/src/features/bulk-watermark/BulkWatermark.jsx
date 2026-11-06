import React, { useState, useEffect, useRef } from 'react';
import { Upload, Sliders, Image as ImageIcon, Check, Download, RefreshCw, Layers, Stamp } from 'lucide-react';
import JSZip from 'jszip';

export default function BulkWatermark() {
  const [images, setImages] = useState([]);
  const [logo, setLogo] = useState(null);
  const [position, setPosition] = useState('bottom-right'); // center, top-left, top-right, bottom-left, bottom-right, tiled, custom
  const [scale, setScale] = useState(20); // 5% to 100% of target image width
  const [opacity, setOpacity] = useState(0.6); // 0.1 to 1.0
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [savedLogos, setSavedLogos] = useState([]);
  const [customX, setCustomX] = useState(10);
  const [customY, setCustomY] = useState(10);
  const [showUploadSection, setShowUploadSection] = useState(true);
  
  const canvasRef = useRef(null);
  const logoImageRef = useRef(null);
  const targetImageRef = useRef(null);

  // Load saved logos from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('saved_watermark_logos');
      if (stored) {
        setSavedLogos(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load saved logos:', e);
    }
  }, []);

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    setImages(prev => [...prev, ...validFiles]);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          logoImageRef.current = img;
          setLogo(event.target.result);
          
          // Save to library
          setSavedLogos(prev => {
            if (prev.some(item => item.data === event.target.result)) return prev;
            const newLogos = [...prev, { id: Date.now().toString(), name: file.name, data: event.target.result }];
            localStorage.setItem('saved_watermark_logos', JSON.stringify(newLogos));
            return newLogos;
          });
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectSavedLogo = (logoItem) => {
    const img = new Image();
    img.onload = () => {
      logoImageRef.current = img;
      setLogo(logoItem.data);
    };
    img.src = logoItem.data;
  };

  const handleDeleteLogo = (id, e) => {
    e.stopPropagation();
    setSavedLogos(prev => {
      const newLogos = prev.filter(item => item.id !== id);
      localStorage.setItem('saved_watermark_logos', JSON.stringify(newLogos));
      return newLogos;
    });
    const deletedLogo = savedLogos.find(item => item.id === id);
    if (deletedLogo && logo === deletedLogo.data) {
      setLogo(null);
      logoImageRef.current = null;
      setPreviewUrl('');
    }
  };

  const generatePreview = () => {
    if (images.length === 0 || !logo) return;

    const firstImageFile = images[0];
    if (!firstImageFile) return;

    const proceedWithPreview = (logoImg) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const img = new Image();
            img.onload = () => {
              try {
                targetImageRef.current = img;
                if (!canvasRef.current) {
                  console.warn("Canvas ref is not ready for preview draw");
                  return;
                }
                drawWatermarkOnCanvas(img, logoImg, canvasRef.current);
                setPreviewUrl(canvasRef.current.toDataURL(firstImageFile.type || 'image/png'));
              } catch (err) {
                console.error("Error generating base64 preview image:", err);
              }
            };
            img.onerror = (err) => {
              console.error("Error loading target preview image element:", err);
            };
            img.src = e.target.result;
          } catch (err) {
            console.error("Error loading target preview image:", err);
          }
        };
        reader.onerror = (err) => {
          console.error("FileReader error in preview onload:", err);
        };
        reader.readAsDataURL(firstImageFile);
      } catch (err) {
        console.error("FileReader error in preview:", err);
      }
    };

    // Robustly check and rebuild logo image element if missing
    if (!logoImageRef.current) {
      try {
        const img = new Image();
        img.onload = () => {
          logoImageRef.current = img;
          proceedWithPreview(img);
        };
        img.onerror = (err) => {
          console.error("Error loading logo image source:", err);
        };
        img.src = logo;
      } catch (err) {
        console.error("Error instantiating logo image:", err);
      }
    } else {
      proceedWithPreview(logoImageRef.current);
    }
  };

  const drawWatermarkOnCanvas = (targetImg, logoImg, canvas) => {
    if (!canvas) {
      console.warn("Canvas element is null or undefined");
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn("Could not get 2d context for canvas");
      return;
    }
    if (!targetImg || !logoImg) {
      console.warn("Missing image or logo elements to draw");
      return;
    }
    try {
      canvas.width = targetImg.naturalWidth || targetImg.width || 300;
      canvas.height = targetImg.naturalHeight || targetImg.height || 150;

      // Draw main image
      ctx.drawImage(targetImg, 0, 0);

      const targetW = canvas.width;
      const targetH = canvas.height;

      // Calculate watermark dimensions
      // Scale is relative to target image width
      const logoW = targetW * (scale / 100);
      const logoNaturalWidth = logoImg.naturalWidth || logoImg.width || 100;
      const logoNaturalHeight = logoImg.naturalHeight || logoImg.height || 100;
      const aspect = logoNaturalHeight / logoNaturalWidth;
      const logoH = logoW * aspect;

      // Margin from edges (e.g. 5% of target width or minimum 15px)
      const margin = Math.max(15, targetW * 0.03);

      ctx.save();
      ctx.globalAlpha = opacity;

      if (position === 'tiled') {
        // Tile mode: draw in a grid across the image
        // Horizontal and vertical gap
        const stepX = logoW * 2.5;
        const stepY = logoH * 2.5;

        for (let x = logoW / 2; x < targetW; x += stepX) {
          for (let y = logoH / 2; y < targetH; y += stepY) {
            ctx.save();
            // Shift canvas origin and rotate for standard watermarking effect
            ctx.translate(x, y);
            ctx.rotate(-30 * Math.PI / 180); // Rotate 30 degrees counter-clockwise
            ctx.drawImage(logoImg, -logoW / 2, -logoH / 2, logoW, logoH);
            ctx.restore();
          }
        }
      } else {
        let x;
        let y;

        switch (position) {
          case 'top-left':
            x = margin;
            y = margin;
            break;
          case 'top-right':
            x = targetW - logoW - margin;
            y = margin;
            break;
          case 'bottom-left':
            x = margin;
            y = targetH - logoH - margin;
            break;
          case 'bottom-right':
            x = targetW - logoW - margin;
            y = targetH - logoH - margin;
            break;
          case 'custom':
            x = (targetW - logoW) * (customX / 100);
            y = (targetH - logoH) * (customY / 100);
            break;
          case 'center':
          default:
            x = (targetW - logoW) / 2;
            y = (targetH - logoH) / 2;
            break;
        }

        ctx.drawImage(logoImg, x, y, logoW, logoH);
      }

      ctx.restore();
    } catch (err) {
      console.error("Error drawing watermark on canvas:", err);
    }
  };

  // Load preview whenever config changes. Placed after the draw helpers so the
  // effect never closes over a function before it has been initialized.
  useEffect(() => {
    if (images.length > 0 && logo) {
      generatePreview();
    } else if (images.length > 0) {
      const reader = new FileReader();
      reader.onload = (event) => setPreviewUrl(event.target.result);
      reader.readAsDataURL(images[0]);
    } else {
      setPreviewUrl('');
    }
  // The state values below are the complete preview invalidation key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, logo, position, scale, opacity, customX, customY]);

  const processSingleImage = (imageFile, logoImg) => {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const img = new Image();
            img.onload = () => {
              try {
                const offscreenCanvas = document.createElement('canvas');
                drawWatermarkOnCanvas(img, logoImg, offscreenCanvas);
                
                offscreenCanvas.toBlob((blob) => {
                  resolve({
                    name: imageFile.name,
                    blob: blob || new Blob()
                  });
                }, imageFile.type || 'image/png', 0.95); // High-quality export
              } catch (err) {
                console.error("Error creating blob for " + imageFile.name, err);
                resolve({ name: imageFile.name, blob: imageFile }); // Fallback
              }
            };
            img.onerror = (err) => {
              console.error("Error loading image elements for " + imageFile.name, err);
              resolve({ name: imageFile.name, blob: imageFile }); // Fallback
            };
            img.src = e.target.result;
          } catch (err) {
            console.error("Error inside reader onload for " + imageFile.name, err);
            resolve({ name: imageFile.name, blob: imageFile }); // Fallback
          }
        };
        reader.onerror = (err) => {
          console.error("FileReader error for " + imageFile.name, err);
          resolve({ name: imageFile.name, blob: imageFile }); // Fallback
        };
        reader.readAsDataURL(imageFile);
      } catch (err) {
        console.error("Error starting file read for " + imageFile.name, err);
        resolve({ name: imageFile.name, blob: imageFile }); // Fallback
      }
    });
  };

  const handleProcessAll = async () => {
    if (images.length === 0 || !logo) return;
    setIsProcessing(true);
    setProcessedCount(0);

    try {
      let logoImg = logoImageRef.current;
      if (!logoImg) {
        logoImg = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = (err) => reject(err);
          img.src = logo;
        });
        logoImageRef.current = logoImg;
      }

      const zip = new JSZip();

      for (let i = 0; i < images.length; i++) {
        const result = await processSingleImage(images[i], logoImg);
        zip.file(result.name, result.blob);
        setProcessedCount(i + 1);
      }

      // Generate ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      
      // Download ZIP
      const link = document.createElement('a');
      const downloadUrl = URL.createObjectURL(content);
      link.href = downloadUrl;
      link.download = 'watermarked_images.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Error during batch watermarking process:", err);
      alert("Đã xảy ra lỗi trong quá trình đóng dấu ảnh: " + (err.message || err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setImages([]);
    setLogo(null);
    logoImageRef.current = null;
    setPreviewUrl('');
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Offscreen Canvas for preview rendering */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Page Header */}
      <div className="header-title-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.55rem' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(245,158,11,0.35)', flexShrink: 0
          }}>
            <Stamp size={22} color="white" />
          </div>
          <h1 className="header-title" style={{ marginBottom: 0 }}>Đóng Dấu Logo Hàng Loạt Vào Ảnh</h1>
          <span style={{
            marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
            padding: '0.3rem 0.8rem', borderRadius: '999px',
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
            color: '#fcd34d', letterSpacing: '0.05em', textTransform: 'uppercase'
          }}>100% Local · Không upload</span>
        </div>
        <p className="header-desc">Bảo vệ bản quyền hình ảnh thương hiệu nhanh chóng trước khi đăng tải. Toàn bộ xử lý ngay trên máy bạn — không tải ảnh lên bất kỳ server nào.</p>
      </div>

      <div className="grid-2">
        {/* Configurations Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* File Upload zone */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: showUploadSection ? '1rem' : '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Layers size={18} style={{ color: 'var(--accent-primary)' }} />
                1. Tải dữ liệu ảnh lên
              </h3>
              <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', cursor: 'pointer', margin: 0 }} title="Thu gọn / Mở rộng">
                <input 
                  type="checkbox" 
                  checked={showUploadSection} 
                  onChange={(e) => setShowUploadSection(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <span style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: showUploadSection ? 'var(--accent-primary, #8b5cf6)' : 'rgba(255,255,255,0.08)',
                  border: showUploadSection ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.12)',
                  transition: 'all 0.2s ease', borderRadius: '20px',
                  boxShadow: showUploadSection ? '0 0 8px rgba(139,92,246,0.4)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 3px'
                }}>
                  <span style={{
                    height: '12px', width: '12px', 
                    backgroundColor: '#ffffff', 
                    borderRadius: '50%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    transform: showUploadSection ? 'translateX(16px)' : 'translateX(0)',
                    transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} />
                </span>
              </label>
            </div>

            {showUploadSection && (
              <>
                {/* Target Images Select */}
                <div className="form-group">
                  <label className="form-label">Tải lên các ảnh cần đóng dấu ({images.length} ảnh đã chọn)</label>
                  <div 
                    style={{ 
                      border: '2px dashed var(--border-color)', 
                      borderRadius: '12px', 
                      padding: '1.5rem', 
                      textAlign: 'center',
                      backgroundColor: 'rgba(255,255,255,0.01)',
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                  >
                    <input 
                      type="file" 
                      multiple 
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    />
                    <Upload size={32} style={{ color: 'var(--text-sub)', marginBottom: '0.5rem' }} />
                    <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>Chọn hoặc Kéo thả nhiều ảnh</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '0.25rem' }}>Định dạng JPG, PNG</p>
                  </div>
                </div>

                {/* Logo Image Select */}
                <div className="form-group">
                  <label className="form-label">Tải lên Logo thương hiệu của bạn</label>
                  <div 
                    style={{ 
                      border: logo ? '1px solid var(--accent-success)' : '2px dashed var(--border-color)', 
                      borderRadius: '12px', 
                      padding: '1.25rem', 
                      textAlign: 'center',
                      backgroundColor: logo ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255,255,255,0.01)',
                      cursor: 'pointer',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '1rem'
                    }}
                  >
                    <input 
                      type="file" 
                      accept="image/png, image/svg+xml, image/webp"
                      onChange={handleLogoUpload}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                    />
                    {logo ? (
                      <>
                        <div style={{ width: '48px', height: '48px', padding: '4px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Check size={14} /> Đã tải logo PNG
                          </p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bấm để thay đổi logo khác</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload size={24} style={{ color: 'var(--text-sub)' }} />
                        <div style={{ textAlign: 'left' }}>
                          <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>Chọn logo thương hiệu</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>Định dạng PNG trong suốt (Transparent)</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Saved Logos Library */}
                {savedLogos.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>THƯ VIỆN LOGO ĐÃ LƯU</label>
                    <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.25rem 0', scrollbarWidth: 'thin' }}>
                      {savedLogos.map((item) => {
                        const isActive = logo === item.data;
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectSavedLogo(item)}
                            style={{
                              position: 'relative',
                              width: '56px',
                              height: '56px',
                              borderRadius: '8px',
                              border: isActive ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                              backgroundColor: 'rgba(255,255,255,0.02)',
                              padding: '4px',
                              cursor: 'pointer',
                              flexShrink: 0,
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title={item.name}
                          >
                            <img src={item.data} alt="saved logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            <button
                              onClick={(e) => handleDeleteLogo(item.id, e)}
                              style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                backgroundColor: 'rgba(239, 68, 68, 0.9)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '16px',
                                height: '16px',
                                fontSize: '9px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                              }}
                              title="Xóa khỏi thư viện"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Config Sliders */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sliders size={18} style={{ color: 'var(--accent-primary)' }} />
              2. Cấu hình đóng dấu
            </h3>

            {/* Position Select */}
            <div className="form-group">
              <label className="form-label">Vị trí của Logo</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.25rem' }}>
                {[
                  { id: 'top-left', name: 'Góc Trái Trên' },
                  { id: 'top-right', name: 'Góc Phải Trên' },
                  { id: 'center', name: 'Chính Giữa' },
                  { id: 'bottom-left', name: 'Góc Trái Dưới' },
                  { id: 'bottom-right', name: 'Góc Phải Dưới' },
                  { id: 'tiled', name: 'Rải Đều (Tiled)' },
                  { id: 'custom', name: 'Tùy chỉnh (Custom)' }
                ].map(pos => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => setPosition(pos.id)}
                    className="btn btn-secondary"
                    style={{ 
                      padding: '0.5rem 0.25rem', 
                      fontSize: '0.8rem', 
                      borderRadius: '8px', 
                      border: position === pos.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                      backgroundColor: position === pos.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                      color: position === pos.id ? 'white' : 'var(--text-muted)',
                      gridColumn: pos.id === 'custom' ? 'span 3' : 'span 1'
                    }}
                  >
                    {pos.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Coordinates sliders if position === 'custom' */}
            {position === 'custom' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Tọa độ X (Ngang): {customX}%</label>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={customX}
                    onChange={(e) => setCustomX(parseInt(e.target.value))}
                    style={{ accentColor: 'var(--accent-primary)', height: '4px', background: 'rgba(255,255,255,0.1)', outline: 'none', borderRadius: '2px', cursor: 'pointer' }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Tọa độ Y (Dọc): {customY}%</label>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={customY}
                    onChange={(e) => setCustomY(parseInt(e.target.value))}
                    style={{ accentColor: 'var(--accent-primary)', height: '4px', background: 'rgba(255,255,255,0.1)', outline: 'none', borderRadius: '2px', cursor: 'pointer' }}
                  />
                </div>
              </div>
            )}

            {/* Scale slider */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Kích thước Logo: {scale}%</label>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>so với chiều rộng ảnh</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={scale}
                onChange={(e) => setScale(parseInt(e.target.value))}
                style={{ accentColor: 'var(--accent-primary)', height: '4px', background: 'rgba(255,255,255,0.1)', outline: 'none', borderRadius: '2px', cursor: 'pointer' }}
              />
            </div>

            {/* Opacity slider */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Độ trong suốt (Opacity): {Math.round(opacity * 100)}%</label>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={opacity * 100}
                onChange={(e) => setOpacity(parseInt(e.target.value) / 100)}
                style={{ accentColor: 'var(--accent-primary)', height: '4px', background: 'rgba(255,255,255,0.1)', outline: 'none', borderRadius: '2px', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>

        {/* Live Preview & Final Output Column */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '450px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <ImageIcon size={18} style={{ color: 'var(--accent-cyan)' }} />
              Bản xem trước (Xem ảnh đầu tiên)
            </h3>
            
            <div style={{ width: '100%', height: '320px', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
              {previewUrl ? (
                <img 
                  src={previewUrl} 
                  alt="Watermark Preview" 
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                />
              ) : (
                <div style={{ color: 'var(--text-sub)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                  <ImageIcon size={48} style={{ opacity: 0.2 }} />
                  <p style={{ fontSize: '0.9rem' }}>Chưa có hình ảnh để xem trước.</p>
                  <p style={{ fontSize: '0.75rem', maxWidth: '280px' }}>Tải ít nhất một hình ảnh và logo thương hiệu ở bảng bên trái.</p>
                </div>
              )}
            </div>

            {images.length > 1 && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Đang hiển thị bản xem trước cho ảnh đầu tiên (1/{images.length}). Toàn bộ {images.length} ảnh sẽ được xử lý khi xuất.
              </div>
            )}
          </div>

          <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleProcessAll}
              disabled={images.length === 0 || !logo || isProcessing}
              className="btn btn-primary"
              style={{ flex: 2, padding: '1rem' }}
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={18} className="spinner" />
                  Đang đóng dấu ({processedCount}/{images.length}) ...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Đóng Dấu & Tải File ZIP ({images.length} ảnh)
                </>
              )}
            </button>
            {(images.length > 0 || logo) && (
              <button
                onClick={handleClearAll}
                className="btn btn-secondary"
                style={{ flex: 1, color: 'var(--text-muted)' }}
              >
                Nhập lại
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Image list drawer in case user wants to inspect which files they added */}
      {images.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Danh sách ảnh đã tải lên ({images.length})</h4>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', maxHeight: '150px', overflowY: 'auto' }}>
            {images.map((file, idx) => (
              <ImageThumbnail 
                key={idx} 
                file={file} 
                onRemove={() => handleRemoveImage(idx)} 
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImageThumbnail({ file, onRemove }) {
  const [thumbnail, setThumbnail] = useState('');

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => setThumbnail(e.target.result);
    reader.readAsDataURL(file);
  }, [file]);

  return (
    <div 
      style={{ 
        position: 'relative', 
        width: '60px', 
        height: '60px', 
        borderRadius: '8px', 
        overflow: 'hidden', 
        border: '1px solid var(--border-color)' 
      }}
    >
      {thumbnail ? (
        <img src={thumbnail} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
      )}
      <button 
        onClick={onRemove}
        style={{ 
          position: 'absolute', 
          top: '2px', 
          right: '2px', 
          backgroundColor: 'rgba(239, 68, 68, 0.8)', 
          color: 'white', 
          border: 'none', 
          borderRadius: '50%', 
          width: '16px', 
          height: '16px', 
          fontSize: '9px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          cursor: 'pointer' 
        }}
        title="Xóa"
      >
        ×
      </button>
    </div>
  );
}
