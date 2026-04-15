import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Loader2, Check, ChevronRight, Save, RefreshCw, Trash2, FileText, Printer, X, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { geminiService, OCRResult, VariantQuestion } from './services/gemini';
import { storageService, NotebookEntry } from './services/storage';
import { cn } from './lib/utils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// --- Components ---

const Button = ({ className, variant = 'primary', size = 'md', ...props }: any) => {
  const variants = {
    primary: 'bg-primary text-white hover:bg-blue-700 shadow-sm',
    secondary: 'bg-white text-text-sub border border-border hover:bg-gray-50',
    ghost: 'bg-transparent text-text-sub border border-border hover:bg-gray-50',
    accent: 'bg-accent text-white hover:bg-amber-600 shadow-sm',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs font-semibold',
    md: 'px-4 py-2 text-sm font-semibold',
    lg: 'px-6 py-3 text-base font-bold',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant as keyof typeof variants],
        sizes[size as keyof typeof sizes],
        className
      )}
      {...props}
    />
  );
};

const Card = ({ children, className, onClick, onContextMenu }: { children: React.ReactNode; className?: string; onClick?: () => void; onContextMenu?: (e: React.MouseEvent) => void; key?: React.Key }) => (
  <div 
    onClick={onClick}
    onContextMenu={onContextMenu}
    className={cn('bg-card rounded-xl border border-border shadow-sm overflow-hidden', className)}
  >
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'recognize' | 'notebook'>('recognize');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [variants, setVariants] = useState<VariantQuestion[]>([]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [notebook, setNotebook] = useState<NotebookEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [showPreview, setShowPreview] = useState<NotebookEntry | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadNotebook();
  }, []);

  const loadNotebook = async () => {
    const entries = await storageService.getAllEntries();
    setNotebook(entries.sort((a, b) => b.createdAt - a.createdAt));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === notebook.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(notebook.map(e => e.id!));
    }
  };

  const deleteEntry = async (id: number, skipConfirm = false) => {
    if (skipConfirm || confirm('确定要删除这条记录吗？')) {
      await storageService.deleteEntries([id]);
      if (showPreview?.id === id) setShowPreview(null);
      setSelectedIds(prev => prev.filter(sid => sid !== id));
      loadNotebook();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        setCapturedImage(base64);
        processImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const highlightKeywords = (text: string) => {
    const keywords = ['易错点', '注意', '关键', '核心', '陷阱', '常见错误', '讨论', '系数', '公式', '定义'];
    let highlighted = text;
    keywords.forEach(word => {
      const reg = new RegExp(`(${word})`, 'gi');
      highlighted = highlighted.replace(reg, '<strong class="text-primary font-bold">$1</strong>');
    });
    return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
  };

  const processImage = async (base64: string) => {
    setIsProcessing(true);
    setOcrResult(null);
    setVariants([]);
    try {
      const result = await geminiService.recognizeQuestion(base64);
      setOcrResult(result);
    } catch (error) {
      console.error('OCR Error:', error);
      alert('识别失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const generateVariants = async () => {
    if (!ocrResult) return;
    setIsGeneratingVariants(true);
    try {
      const result = await geminiService.generateVariants(ocrResult.question, ocrResult.knowledgePoint);
      setVariants(result);
    } catch (error) {
      console.error('Generation Error:', error);
      alert('生成失败，请重试');
    } finally {
      setIsGeneratingVariants(false);
    }
  };

  const saveToNotebook = async () => {
    if (!ocrResult || variants.length === 0) return;
    const entry: NotebookEntry = {
      originalImage: capturedImage || undefined,
      originalQuestion: ocrResult.question,
      options: ocrResult.options,
      userAnswer: ocrResult.userAnswer,
      standardAnswer: ocrResult.standardAnswer,
      knowledgePoint: ocrResult.knowledgePoint,
      variants: variants,
      createdAt: Date.now(),
    };
    await storageService.saveEntry(entry);
    alert('已保存到错题本');
    setOcrResult(null);
    setVariants([]);
    setCapturedImage(null);
    loadNotebook();
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (confirm(`确定要删除选中的 ${selectedIds.length} 条记录吗？`)) {
      await storageService.deleteEntries(selectedIds);
      setSelectedIds([]);
      loadNotebook();
    }
  };

  const exportToPDF = async () => {
    const selectedEntries = notebook.filter(e => selectedIds.includes(e.id!));
    if (selectedEntries.length === 0) return;

    setIsExporting(true);
    const printArea = document.createElement('div');
    printArea.style.position = 'absolute';
    printArea.style.left = '-9999px';
    printArea.style.width = '800px';
    printArea.style.padding = '60px';
    printArea.style.backgroundColor = 'white';
    printArea.className = 'pdf-export-container';

    printArea.innerHTML = `
      <div style="text-align: center; margin-bottom: 40px;">
        <h1 style="font-size: 28px; font-weight: 800; color: #111827; margin-bottom: 8px;">错题举一反三练习本</h1>
        <p style="color: #6b7280; font-size: 14px;">生成日期：${new Date().toLocaleDateString()}</p>
      </div>
    `;

    selectedEntries.forEach((entry, index) => {
      const section = document.createElement('div');
      section.style.marginBottom = '50px';
      section.style.pageBreakInside = 'avoid';
      section.style.border = '1px solid #f3f4f6';
      section.style.borderRadius = '16px';
      section.style.padding = '30px';
      section.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #f3f4f6; padding-bottom: 12px;">
          <span style="font-weight: 800; font-size: 16px; color: #4f46e5;">题目 ${index + 1}</span>
          <span style="font-size: 12px; background: #eef2ff; color: #4f46e5; padding: 4px 12px; border-radius: 99px; font-weight: 600;">${entry.knowledgePoint}</span>
        </div>
        
        <div style="margin-bottom: 24px;">
          <p style="font-size: 14px; font-weight: 700; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.05em;">原题内容</p>
          <p style="font-size: 16px; line-height: 1.7; color: #374151;">${entry.originalQuestion}</p>
          ${entry.options ? `<div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">${entry.options.map(o => `<div style="font-size: 14px; color: #4b5563;">${o}</div>`).join('')}</div>` : ''}
        </div>

        <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px;">
          <p style="font-size: 14px; font-weight: 700; color: #4f46e5; text-transform: uppercase; margin-bottom: 16px; letter-spacing: 0.05em;">举一反三变式练习</p>
          ${entry.variants.map((v, i) => `
            <div style="margin-bottom: 24px; ${i === entry.variants.length - 1 ? '' : 'border-bottom: 1px dashed #e2e8f0; padding-bottom: 20px;'}">
              <p style="font-weight: 600; font-size: 15px; color: #1e293b; margin-bottom: 10px;">变式 ${i + 1}：${v.question}</p>
              <div style="display: flex; gap: 20px; margin-top: 8px;">
                <div style="font-size: 13px;"><span style="color: #10b981; font-weight: 700;">答案：</span>${v.answer}</div>
              </div>
              <p style="font-size: 12px; color: #64748b; margin-top: 6px; line-height: 1.5;"><span style="font-weight: 700;">解析：</span>${v.analysis}</p>
            </div>
          `).join('')}
        </div>
      `;
      printArea.appendChild(section);
    });

    document.body.appendChild(printArea);
    
    try {
      const canvas = await html2canvas(printArea, { 
        scale: 2,
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`错题本_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error(err);
      alert('导出 PDF 失败');
    } finally {
      document.body.removeChild(printArea);
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen bg-bg flex flex-col font-sans text-text-main overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-card border-b border-border px-6 sticky top-0 z-30 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
            π
          </div>
          <h1 className="text-lg font-bold text-text-main">错题打印助手</h1>
        </div>
        
        <nav className="flex gap-8 h-full">
          <button 
            onClick={() => setActiveTab('recognize')}
            className={cn(
              "text-[15px] font-medium transition-colors relative h-full flex items-center",
              activeTab === 'recognize' ? "text-primary after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:height-[3px] after:bg-primary after:rounded-t-[3px]" : "text-text-sub"
            )}
          >
            拍照识别与生成
          </button>
          <button 
            onClick={() => setActiveTab('notebook')}
            className={cn(
              "text-[15px] font-medium transition-colors relative h-full flex items-center",
              activeTab === 'notebook' ? "text-primary after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:height-[3px] after:bg-primary after:rounded-t-[3px]" : "text-text-sub"
            )}
          >
            历史错题本
          </button>
        </nav>

        <div className="flex items-center gap-3">
          {activeTab === 'notebook' && notebook.length > 0 && (
            <>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={toggleSelectAll}
              >
                {selectedIds.length === notebook.length ? '取消全选' : '全选'}
              </Button>
              {selectedIds.length > 0 && (
                <>
                  <Button variant="danger" size="sm" onClick={deleteSelected}>
                    <Trash2 className="w-4 h-4 mr-1" /> 删除 ({selectedIds.length})
                  </Button>
                  <Button variant="accent" size="sm" onClick={exportToPDF} disabled={isExporting}>
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Printer className="w-4 h-4 mr-1" /> 导出 PDF ({selectedIds.length})</>}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className={cn(
        "flex-1 overflow-hidden",
        activeTab === 'recognize' ? "grid grid-cols-[1.2fr_1fr] gap-6 p-6" : "p-6 overflow-y-auto"
      )}>
        {activeTab === 'recognize' ? (
          <>
            {/* Left Panel: Source & Recognition */}
            <div className="flex flex-col overflow-hidden">
              <Card className="flex-1 flex flex-col bg-white shadow-xl border-none overflow-hidden">
                {!capturedImage && !isProcessing ? (
                  /* Initial Upload State */
                  <div 
                    className="flex-1 flex flex-col items-center justify-center p-10 cursor-pointer hover:bg-slate-50 transition-colors group"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-20 h-20 bg-primary/5 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                      <Camera className="w-10 h-10 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold text-text-main mb-2">开始识别错题</h3>
                    <p className="text-sm text-text-sub text-center max-w-[240px] leading-relaxed">
                      拍摄或从相册选择一张包含错题的照片，AI 将为您智能提取内容并生成变式
                    </p>
                    <div className="mt-8 px-6 py-2.5 bg-primary text-white rounded-full text-sm font-bold shadow-md shadow-primary/20">
                      立即上传照片
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileUpload}
                    />
                  </div>
                ) : (
                  /* Processing or Result State */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Image Preview Header */}
                    <div className="relative h-48 bg-slate-900 shrink-0 group">
                      <img 
                        src={capturedImage || ''} 
                        className={cn(
                          "w-full h-full object-contain transition-opacity duration-500",
                          isProcessing ? "opacity-50" : "opacity-100"
                        )} 
                        alt="Captured" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                      
                      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">当前识别图片</span>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs font-bold text-white">已成功载入</span>
                          </div>
                        </div>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20 rounded-full"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Camera className="w-3 h-3 mr-1.5" /> 重新拍照上传
                        </Button>
                      </div>

                      {isProcessing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
                          <div className="relative">
                            <Loader2 className="w-12 h-12 text-white animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                            </div>
                          </div>
                          <p className="mt-3 text-sm font-bold text-white tracking-wide">AI 正在深度解析...</p>
                        </div>
                      )}
                    </div>

                    {/* Recognition Content */}
                    <div className="flex-1 flex flex-col p-6 overflow-hidden">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[13px] font-extrabold text-primary uppercase tracking-widest flex items-center gap-2">
                          <div className="w-1.5 h-4 bg-primary rounded-full"></div>
                          原题识别与确认
                        </span>
                        {ocrResult && (
                          <span className="text-[11px] text-text-sub bg-slate-100 px-2 py-1 rounded">
                            已提取 {ocrResult.question.length} 字
                          </span>
                        )}
                      </div>

                      {ocrResult ? (
                        <div className="flex-1 flex flex-col overflow-hidden">
                          <div className="flex-1 bg-slate-50/50 border border-slate-100 rounded-2xl p-5 mb-5 overflow-y-auto group focus-within:border-primary/30 transition-colors">
                            <textarea 
                              className="w-full h-32 bg-transparent border-none focus:ring-0 text-lg leading-relaxed text-text-main resize-none font-medium mb-4"
                              value={ocrResult.question}
                              onChange={(e) => setOcrResult({...ocrResult, question: e.target.value})}
                              placeholder="识别内容将显示在这里..."
                            />
                            {ocrResult.options && ocrResult.options.length > 0 && (
                              <div className="space-y-2 pt-4 border-t border-slate-200">
                                <label className="text-[10px] font-bold text-text-sub uppercase block mb-2">选项编辑</label>
                                <div className="grid grid-cols-2 gap-2">
                                  {ocrResult.options.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-100">
                                      <span className="text-[10px] font-bold text-primary">{String.fromCharCode(65 + idx)}</span>
                                      <input 
                                        className="flex-1 bg-transparent border-none p-0 text-xs focus:ring-0"
                                        value={opt}
                                        onChange={(e) => {
                                          const newOpts = [...ocrResult.options!];
                                          newOpts[idx] = e.target.value;
                                          setOcrResult({...ocrResult, options: newOpts});
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 mb-5">
                            <div className="bg-red-50/30 p-3 rounded-xl border border-red-50 relative group/input">
                              <label className="text-[10px] font-bold text-red-400 uppercase mb-1 block">我的回答</label>
                              <input 
                                className="w-full bg-transparent border-none p-0 text-sm text-red-600 font-bold focus:ring-0"
                                value={ocrResult.userAnswer || ''}
                                onChange={(e) => setOcrResult({...ocrResult, userAnswer: e.target.value})}
                                placeholder="未识别到回答"
                              />
                              {ocrResult.userAnswer && ocrResult.standardAnswer && (
                                <div className="absolute top-3 right-3">
                                  {ocrResult.userAnswer.trim().toLowerCase() === ocrResult.standardAnswer.trim().toLowerCase() ? (
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                                      <Check className="w-3 h-3" /> 正确
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                                      <X className="w-3 h-3" /> 错误
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="bg-green-50/30 p-3 rounded-xl border border-green-50">
                              <label className="text-[10px] font-bold text-green-400 uppercase mb-1 block">标准答案</label>
                              <input 
                                className="w-full bg-transparent border-none p-0 text-sm text-green-600 font-bold focus:ring-0"
                                value={ocrResult.standardAnswer || ''}
                                onChange={(e) => setOcrResult({...ocrResult, standardAnswer: e.target.value})}
                                placeholder="未识别到答案"
                              />
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-100 flex items-center justify-between mb-6">
                            <div>
                              <span className="text-[11px] font-bold text-text-sub uppercase tracking-wider mb-2 block">AI 知识点定位</span>
                              <input 
                                className="bg-primary text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-sm shadow-primary/20 inline-block border-none focus:ring-2 focus:ring-white/50 w-full max-w-[200px]"
                                value={ocrResult.knowledgePoint}
                                onChange={(e) => setOcrResult({...ocrResult, knowledgePoint: e.target.value})}
                              />
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="rounded-full h-10 px-4 text-xs font-bold border-slate-200"
                              onClick={() => processImage(capturedImage!)}
                            >
                              <RefreshCw className="w-3.5 h-3.5 mr-2" /> 重新识别
                            </Button>
                          </div>

                          {/* Upload Next Question Section */}
                          <div className="mt-auto pt-6 border-t border-dashed border-slate-200">
                            <div 
                              className="w-full py-4 px-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-3 cursor-pointer hover:bg-primary/5 hover:border-primary/30 transition-all group"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <div className="w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Plus className="w-4 h-4 text-primary" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-text-main group-hover:text-primary transition-colors">识别下一张错题</span>
                                <span className="text-[10px] text-text-sub">点击此处快速拍照或从相册上传</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                          <Loader2 className="w-8 h-8 animate-spin mb-2" />
                          <p className="text-sm">等待识别结果...</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
              
              {/* Hidden file input for "Change Image" */}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
              />
            </div>

            {/* Right Panel: Variations */}
            <div className="flex flex-col gap-4 overflow-y-auto pr-1">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-text-main">AI 智能举一反三题目 (3道)</h2>
                {ocrResult && (
                  <Button variant="ghost" size="sm" onClick={generateVariants} disabled={isGeneratingVariants}>
                    {isGeneratingVariants ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-3 h-3 mr-1" /> 重新生成题目</>}
                  </Button>
                )}
              </div>

              <div className="flex-1 space-y-3">
                {isGeneratingVariants ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-text-sub font-medium">正在为您生成变式题目...</p>
                  </div>
                ) : variants.length > 0 ? (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      {variants.map((v, i) => (
                        <Card key={i} className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                              {i + 1}
                            </span>
                            <span className="text-sm font-bold text-primary">变式 {i + 1}</span>
                          </div>
                          <p className="text-sm text-text-main leading-relaxed mb-3">{v.question}</p>
                          <div className="analysis-box">
                            <span className="text-xs font-bold text-amber-800 mb-1 block">易错点分析：</span>
                            <p className="text-xs text-amber-900 leading-relaxed">{highlightKeywords(v.analysis)}</p>
                            <p className="text-xs font-bold text-green-700 mt-2">答案：{v.answer}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                    
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pt-4 pb-8"
                    >
                      <Button 
                        variant="primary" 
                        size="lg" 
                        className="w-full shadow-lg shadow-primary/20 py-4 rounded-2xl font-bold"
                        onClick={saveToNotebook}
                      >
                        <Save className="w-5 h-5 mr-2" /> 保存“原题+变式”到错题本
                      </Button>
                    </motion.div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-30">
                    <RefreshCw className="w-12 h-12 mb-4" />
                    <p>识别题目后点击生成变式</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Notebook Tab */
          <div className="max-w-4xl mx-auto space-y-4">
            {notebook.length > 0 && (
              <div className="flex items-center justify-between mb-2 px-2">
                <div className="flex items-center gap-4">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={toggleSelectAll}
                    className="text-xs font-bold text-text-sub hover:text-primary"
                  >
                    {selectedIds.length === notebook.length ? '取消全选' : '全选所有'}
                  </Button>
                  {selectedIds.length > 0 && (
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">
                      已选中 {selectedIds.length} 项
                    </span>
                  )}
                </div>
                {selectedIds.length > 0 && (
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" onClick={deleteSelected}>
                      <Trash2 className="w-3 h-3 mr-1" /> 删除选中
                    </Button>
                    <Button variant="accent" size="sm" onClick={exportToPDF} disabled={isExporting}>
                      {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Printer className="w-3 h-3 mr-1" /> 打印选中</>}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {notebook.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-text-sub font-medium">还没有错题记录</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {notebook.map((entry) => (
                  <Card 
                    key={entry.id} 
                    className={cn(
                      "p-4 cursor-pointer transition-all hover:border-primary/30",
                      selectedIds.includes(entry.id!) ? "ring-2 ring-primary border-transparent" : ""
                    )}
                    onClick={() => {
                      if (selectedIds.length > 0) {
                        setSelectedIds(prev => prev.includes(entry.id!) ? prev.filter(id => id !== entry.id) : [...prev, entry.id!]);
                      } else {
                        setShowPreview(entry);
                      }
                    }}
                  >
                    <div className="flex gap-4 relative group">
                      {entry.originalImage && (
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 border border-border">
                          <img src={entry.originalImage} className="w-full h-full object-cover" alt="Thumb" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <span className="bg-primary-light text-primary px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                            {entry.knowledgePoint}
                          </span>
                          <span className="text-[10px] text-text-sub">{new Date(entry.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm font-medium text-text-main line-clamp-2 mb-2">{entry.originalQuestion}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-text-sub font-medium">
                            {entry.variants.length} 道变式练习
                          </span>
                          {selectedIds.length === 0 && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteEntry(entry.id!);
                              }}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                              title="删除此项"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {selectedIds.length > 0 && (
                        <div className={cn(
                          "w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0",
                          selectedIds.includes(entry.id!) ? "bg-primary border-primary text-white" : "border-border"
                        )}>
                          {selectedIds.includes(entry.id!) && <Check className="w-3 h-3" />}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer Actions Bar (Only for Recognize Tab) */}
      {activeTab === 'recognize' && (
        <div className="h-20 bg-card border-t border-border px-6 flex items-center justify-between shrink-0">
          <div className="flex gap-4">
            <Button variant="ghost" onClick={() => {setOcrResult(null); setVariants([]); setCapturedImage(null);}}>
              清空当前内容
            </Button>
          </div>
          <div className="flex gap-4">
            {ocrResult && variants.length > 0 && (
              <Button variant="accent" onClick={exportToPDF} disabled={isExporting}>
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Printer className="w-4 h-4 mr-2" /> 一键生成PDF并打印</>}
              </Button>
            )}
            <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
              <Camera className="w-4 h-4 mr-2" /> 重新拍照上传
            </Button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowPreview(null)}
          >
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white w-full max-w-2xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="font-bold text-lg">错题详情</h2>
                <button onClick={() => setShowPreview(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <section>
                  <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">原题</label>
                  <p className="text-gray-800 leading-relaxed">{showPreview.originalQuestion}</p>
                  {showPreview.originalImage && (
                    <img src={showPreview.originalImage} className="mt-4 rounded-xl w-full" alt="Original" />
                  )}
                </section>
                
                <section className="bg-indigo-50/50 rounded-2xl p-6 space-y-4">
                  <label className="text-xs font-bold text-indigo-400 uppercase block">举一反三练习</label>
                  {showPreview.variants.map((v, i) => (
                    <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-indigo-100">
                      <p className="font-medium text-gray-800 mb-2">{i + 1}. {v.question}</p>
                      <p className="text-sm text-green-600 font-bold mb-1">答案：{v.answer}</p>
                      <p className="text-xs text-gray-500 italic">解析：{highlightKeywords(v.analysis)}</p>
                    </div>
                  ))}
                </section>
              </div>
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                <Button variant="danger" className="flex-1" onClick={() => deleteEntry(showPreview.id!)}>
                  <Trash2 className="w-4 h-4 mr-2" /> 删除记录
                </Button>
                <Button variant="primary" className="flex-1" onClick={() => setShowPreview(null)}>
                  关闭预览
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-gray-100 px-8 py-3 flex justify-around items-center z-10">
        <button 
          onClick={() => setActiveTab('recognize')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'recognize' ? "text-indigo-600" : "text-gray-400"
          )}
        >
          <Camera className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wider">识别</span>
        </button>
        <button 
          onClick={() => setActiveTab('notebook')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'notebook' ? "text-indigo-600" : "text-gray-400"
          )}
        >
          <FileText className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wider">错题本</span>
        </button>
      </nav>
    </div>
  );
}
