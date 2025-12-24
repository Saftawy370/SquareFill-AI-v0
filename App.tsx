
import React, { useState, useRef, useCallback } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { Layout } from './components/Layout';
import { ImageState, ProcessingHistory } from './types';
import { processImageToSquare } from './services/geminiService';

// Add type for heic2any which is loaded via CDN
declare var heic2any: any;

const App: React.FC = () => {
  const [state, setState] = useState<ImageState>({
    original: null,
    processed: null,
    mimeType: null,
    isProcessing: false,
    error: null,
  });

  // Cropping specific state
  const [isCroppingResult, setIsCroppingResult] = useState(false);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Final Step state: Dimension Selection
  const [showDimensionPicker, setShowDimensionPicker] = useState(false);
  const [selectedDimension, setSelectedDimension] = useState<number>(1000);

  const [history, setHistory] = useState<ProcessingHistory[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      let processableFile: Blob = file;
      let targetMimeType = file.type;

      if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
        try {
          const converted = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.9
          });
          processableFile = Array.isArray(converted) ? converted[0] : converted;
          targetMimeType = 'image/jpeg';
        } catch (err) {
          console.error("HEIC conversion failed:", err);
          throw new Error("فشل تحويل ملف HEIC. يرجى استخدام صيغة أخرى.");
        }
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setState({
          original: event.target?.result as string,
          processed: null,
          mimeType: targetMimeType,
          isProcessing: false,
          error: null,
        });
      };
      reader.readAsDataURL(processableFile);
    } catch (error: any) {
      setState(prev => ({ ...prev, isProcessing: false, error: error.message }));
    }
  };

  const startProcessing = async () => {
    if (!state.original || !state.mimeType) return;

    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      const result = await processImageToSquare(state.original, state.mimeType);
      setState(prev => ({ ...prev, processed: result, isProcessing: false }));
      
      const newEntry: ProcessingHistory = {
        id: Math.random().toString(36).substr(2, 9),
        original: state.original,
        processed: result,
        timestamp: Date.now(),
      };
      setHistory(prev => [newEntry, ...prev.slice(0, 4)]);
    } catch (error: any) {
      setState(prev => ({ ...prev, isProcessing: false, error: error.message }));
    }
  };

  const handleApplyCrop = () => {
    if (!state.processed || !croppedAreaPixels) return;
    setIsCroppingResult(false);
    setShowDimensionPicker(true);
  };

  const finalDownload = async () => {
    if (!state.processed || !croppedAreaPixels) return;

    try {
      const image = new Image();
      image.src = state.processed;
      await new Promise((resolve) => (image.onload = resolve));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // The selected dimension determines the output canvas size (Square)
      canvas.width = selectedDimension;
      canvas.height = selectedDimension;

      // Enable smooth scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        selectedDimension,
        selectedDimension
      );

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `squarefill-${selectedDimension}x${selectedDimension}-${Date.now()}.webp`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Return to result view after download or stay? User choice. Let's stay in picker.
      }, 'image/webp', 0.95);
    } catch (e) {
      console.error(e);
      setState(prev => ({ ...prev, error: 'فشل في تصدير الصورة بالأبعاد المطلوبة.' }));
    }
  };

  const reset = () => {
    setState({
      original: null,
      processed: null,
      mimeType: null,
      isProcessing: false,
      error: null,
    });
    setIsCroppingResult(false);
    setShowDimensionPicker(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Layout>
      <div className="space-y-12 text-right" dir="rtl">
        {/* Step 1: Upload */}
        {!state.original && (
          <div className="text-center space-y-6 max-w-2xl mx-auto animate-in fade-in duration-500">
            <h2 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
              حول أي صورة إلى <span className="text-indigo-500">مربعة (1:1)</span> بذكاء
            </h2>
            <p className="text-lg text-slate-400">
              ارفع صورتك وسيقوم الذكاء الاصطناعي بإكمال الجوانب، ثم يمكنك التحكم في الأبعاد النهائية وتحميلها.
            </p>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="mt-10 p-12 border-2 border-dashed border-slate-700 rounded-2xl hover:border-indigo-500 hover:bg-slate-900/50 transition-all cursor-pointer group"
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*,.heic,.heif"
                className="hidden"
              />
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl font-semibold text-white">اضغط لرفع الصورة (يدعم HEIC)</p>
                  <p className="text-slate-500">تحويل ذكي، قص مخصص، واختيار أبعاد التحميل</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Processing and View Result */}
        {state.original && !isCroppingResult && !showDimensionPicker && (
          <div className="grid md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">الصورة الأصلية</h3>
              <div className="relative aspect-video md:aspect-auto md:h-[400px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                <img src={state.original} alt="Original" className="max-w-full max-h-full object-contain" />
              </div>
              {!state.processed && !state.isProcessing && (
                <div className="flex gap-4">
                  <button 
                    onClick={startProcessing}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-6 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
                  >
                    توليد الخلفية الذكية
                  </button>
                  <button 
                    onClick={reset}
                    className="px-6 border border-slate-700 hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">النتيجة المولدة (1:1)</h3>
              <div className="aspect-square w-full md:h-[400px] md:w-[400px] mx-auto bg-slate-900 rounded-xl overflow-hidden border-2 border-slate-800 flex items-center justify-center relative shadow-2xl">
                {state.isProcessing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-10">
                    <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="mt-4 font-medium text-slate-300">جاري إكمال الحواف بدقة عالية...</p>
                  </div>
                )}
                
                {state.processed ? (
                  <img src={state.processed} alt="Processed" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-slate-600 flex flex-col items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm">ستظهر النتيجة المربعة هنا</p>
                  </div>
                )}

                {state.error && (
                  <div className="absolute inset-x-0 bottom-0 bg-red-950/90 text-red-200 p-3 text-xs text-center border-t border-red-800">
                    {state.error}
                  </div>
                )}
              </div>

              {state.processed && (
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => setIsCroppingResult(true)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 px-6 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7 7m-7-7l-2.879 2.879M12 12L9.121 9.121m0 5.758L5 19m0-14l14 14M5 5l14 14" />
                    </svg>
                    الانتقال لقص الصورة
                  </button>
                  <button 
                    onClick={reset}
                    className="w-full py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-xl transition-colors"
                  >
                    تجربة صورة أخرى
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Cropping */}
        {isCroppingResult && state.processed && (
          <div className="space-y-6 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-2xl font-bold text-white">قص النتيجة النهائية (1:1)</h3>
              <p className="text-slate-400 text-sm">حدد الجزء المربع الذي تريده من الصورة المولدة</p>
            </div>
            
            <div className="relative w-full h-[500px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800">
              <Cropper
                image={state.processed}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="flex flex-col md:flex-row items-center gap-6 bg-slate-900 p-4 rounded-xl border border-slate-800">
              <div className="flex-1 w-full space-y-2 text-right">
                <label className="text-xs text-slate-400 uppercase tracking-widest font-bold">التقريب (Zoom)</label>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                <button 
                  onClick={handleApplyCrop}
                  className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-8 rounded-xl font-bold transition-all shadow-lg"
                >
                  تأكيد القص والانتقال للتحميل
                </button>
                <button 
                  onClick={() => setIsCroppingResult(false)}
                  className="px-6 border border-slate-700 hover:bg-slate-800 text-white rounded-xl transition-colors"
                >
                  رجوع
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Dimension Selection & Download */}
        {showDimensionPicker && state.processed && (
          <div className="max-w-xl mx-auto space-y-8 animate-in slide-in-from-bottom-8 duration-500 bg-slate-900/40 p-8 rounded-3xl border border-slate-800">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-white">اختر أبعاد التحميل</h3>
              <p className="text-slate-400">سيتم تعديل الحجم بدقة عالية دون التأثير على نتيجة القص</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[500, 1000, 1500].map((dim) => (
                <button
                  key={dim}
                  onClick={() => setSelectedDimension(dim)}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                    selectedDimension === dim 
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10' 
                      : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <span className={`text-lg font-bold ${selectedDimension === dim ? 'text-indigo-400' : 'text-slate-300'}`}>
                    {dim}x{dim}
                  </span>
                  <span className="text-xs text-slate-500 uppercase tracking-tighter">بكسل</span>
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <button 
                onClick={finalDownload}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 text-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                تحميل بصيغة WEBP ({selectedDimension} بكسل)
              </button>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setShowDimensionPicker(false); setIsCroppingResult(true); }}
                  className="flex-1 py-3 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-xl transition-colors"
                >
                  تعديل القص
                </button>
                <button 
                  onClick={reset}
                  className="flex-1 py-3 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-xl transition-colors"
                >
                  صورة جديدة
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History Section */}
        {history.length > 0 && !isCroppingResult && !showDimensionPicker && (
          <div className="space-y-6 pt-12 border-t border-slate-800">
            <h3 className="text-2xl font-bold text-white">الأعمال الأخيرة</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
              {history.map(item => (
                <div 
                  key={item.id} 
                  className="group relative aspect-square bg-slate-900 rounded-lg overflow-hidden border border-slate-800 cursor-pointer"
                  onClick={() => {
                    setState(prev => ({ ...prev, original: item.original, processed: item.processed, error: null }));
                    setShowDimensionPicker(false);
                    setIsCroppingResult(false);
                  }}
                >
                  <img src={item.processed} alt="History" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs font-bold text-white uppercase bg-slate-900/80 px-2 py-1 rounded">عرض</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Cards */}
        {!state.original && (
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { 
                title: "إكمال احترافي للحواف", 
                desc: "نفس نمط الخلفية الأصلي تماماً، لتوسيع آفاق صورتك وتحويلها لمربعة.",
                icon: (
                  <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                )
              },
              { 
                title: "قص وتحجيم مرن", 
                desc: "حدد منطقة القص المطلوبة واختر الأبعاد المناسبة لاستخدامك (500، 1000، أو 1500 بكسل).",
                icon: (
                  <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )
              },
              { 
                title: "جودة WEBP متفوقة", 
                desc: "يتم تصدير الصور بصيغة WEBP التي تجمع بين صغر الحجم وجودة الصورة العالية.",
                icon: (
                  <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                )
              }
            ].map((feature, i) => (
              <div key={i} className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors text-right">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-4 mr-0 ml-auto">
                  {feature.icon}
                </div>
                <h4 className="text-lg font-bold text-white mb-2">{feature.title}</h4>
                <p className="text-slate-400 text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default App;
