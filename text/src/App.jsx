import React, { useState, useRef } from "react";
import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min?url";
import { read, utils } from "xlsx";
import mammoth from "mammoth";
import Tesseract from "tesseract.js";
import { jsPDF } from "jspdf";
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer, toast } from 'react-toastify';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = worker;

// AI Service Configuration
const AI_CONFIG = {
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
    apiKey: "AIzaSyBIG7T9Le8HEhCd_qeCMP_BCZCKRSSBhAs", // Replace with actual key
    headers: { "Content-Type": "application/json" }
  },
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKey: "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", // Replace with actual key
    headers: { 
      "Content-Type": "application/json",
      "Authorization": "Bearer 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"
    }
  },
  fallbackToLocal: true
};

// File type configuration
const FILE_TYPES = {
  pdf: {
    extensions: ["pdf"],
    name: "PDF",
    color: "bg-red-100 text-red-800"
  },
  word: {
    extensions: ["doc", "docx"],
    name: "Word",
    color: "bg-blue-100 text-blue-800"
  },
  excel: {
    extensions: ["xls", "xlsx", "csv"],
    name: "Excel",
    color: "bg-green-100 text-green-800"
  },
  image: {
    extensions: ["jpg", "jpeg", "png", "gif", "bmp", "tiff"],
    name: "Image",
    color: "bg-purple-100 text-purple-800"
  }
};

function App() {
  // State management
  const [files, setFiles] = useState([]);
  const [extractedTexts, setExtractedTexts] = useState([]);
  const [structuredDocument, setStructuredDocument] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");
  const [documentSpec, setDocumentSpec] = useState(
    `Create a comprehensive engineering document with these sections:
1. Executive Summary
2. Technical Specifications
3. System Architecture
4. Implementation Details
5. Test Results
6. Conclusion
    
Format requirements:
- Use Markdown-style headings (#, ##, ###)
- Maintain technical accuracy
- Standardize units and terminology
- Include all relevant data`
  );
  const fileInputRef = useRef(null);

  // Helper functions
  const getFileType = (fileName) => {
    const extension = fileName.split(".").pop().toLowerCase();
    for (const [type, config] of Object.entries(FILE_TYPES)) {
      if (config.extensions.includes(extension)) {
        return { type, ...config };
      }
    }
    return { 
      type: "unsupported", 
      name: "Unsupported", 
      color: "bg-gray-100 text-gray-800" 
    };
  };

  const showToast = (message, type = "info") => {
    toast[type](message, {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
    });
  };

  // File handling
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;

    const validFiles = selectedFiles.filter(file => {
      const { type } = getFileType(file.name);
      return type !== "unsupported";
    });

    if (validFiles.length !== selectedFiles.length) {
      showToast("Some files were ignored due to unsupported formats", "warning");
    }

    setFiles(prevFiles => {
      const newFiles = [...prevFiles];
      validFiles.forEach(newFile => {
        if (!prevFiles.some(existingFile => 
          existingFile.name === newFile.name && 
          existingFile.size === newFile.size &&
          existingFile.lastModified === newFile.lastModified
        )) {
          newFiles.push(newFile);
        }
      });
      return newFiles;
    });
    
    setError("");
    setExtractedTexts([]);
    setStructuredDocument("");
  };

  const removeFile = (indexToRemove) => {
    setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    showToast("File removed", "success");
  };

  const clearAllFiles = () => {
    setFiles([]);
    setExtractedTexts([]);
    setStructuredDocument("");
    showToast("All files cleared", "success");
  };

  // Text extraction functions
  const extractTextFromPDF = async (pdfFile) => {
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let text = "";
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(" ");
        text += pageText + "\n\n";
      }
      
      return { 
        fileName: pdfFile.name, 
        text, 
        type: "PDF",
        success: true
      };
    } catch (error) {
      console.error(`PDF extraction failed (${pdfFile.name}):`, error);
      return {
        fileName: pdfFile.name,
        text: `ERROR: Failed to extract PDF content - ${error.message}`,
        type: "PDF",
        success: false
      };
    }
  };

  const extractTextFromExcel = async (excelFile) => {
    try {
      const arrayBuffer = await excelFile.arrayBuffer();
      const workbook = read(arrayBuffer);
      let text = "";
      
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        text += `=== ${sheetName} ===\n`;
        text += utils.sheet_to_csv(worksheet) + "\n\n";
      });
      
      return { 
        fileName: excelFile.name, 
        text, 
        type: "Excel",
        success: true
      };
    } catch (error) {
      console.error(`Excel extraction failed (${excelFile.name}):`, error);
      return {
        fileName: excelFile.name,
        text: `ERROR: Failed to extract Excel content - ${error.message}`,
        type: "Excel",
        success: false
      };
    }
  };

  const extractTextFromWord = async (wordFile) => {
    try {
      const arrayBuffer = await wordFile.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { 
        fileName: wordFile.name, 
        text: result.value, 
        type: "Word",
        success: true
      };
    } catch (error) {
      console.error(`Word extraction failed (${wordFile.name}):`, error);
      return {
        fileName: wordFile.name,
        text: `ERROR: Failed to extract Word content - ${error.message}`,
        type: "Word",
        success: false
      };
    }
  };

  const extractTextFromImage = async (imageFile) => {
    try {
      const result = await Tesseract.recognize(
        imageFile,
        "eng",
        { 
          logger: m => console.log(m),
          tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,;:!?@#$%^&*()-_=+[]{}|\\\'"<>/`~ '
        }
      );
      return { 
        fileName: imageFile.name, 
        text: result.data.text, 
        type: "Image",
        success: true
      };
    } catch (error) {
      console.error(`Image extraction failed (${imageFile.name}):`, error);
      return {
        fileName: imageFile.name,
        text: `ERROR: Failed to extract Image content - ${error.message}`,
        type: "Image",
        success: false
      };
    }
  };

  const handleExtractText = async () => {
    if (!files.length) {
      setError("Please select files first");
      showToast("Please select files first", "error");
      return;
    }

    setIsLoading(true);
    setError("");
    setStructuredDocument("");
    showToast("Starting text extraction...", "info");

    try {
      const extractionResults = await Promise.all(
        files.map(async file => {
          const { type } = getFileType(file.name);
          switch (type) {
            case "pdf": return await extractTextFromPDF(file);
            case "word": return await extractTextFromWord(file);
            case "excel": return await extractTextFromExcel(file);
            case "image": return await extractTextFromImage(file);
            default: return {
              fileName: file.name,
              text: `ERROR: Unsupported file type`,
              type: "Unsupported",
              success: false
            };
          }
        })
      );

      setExtractedTexts(extractionResults);
      
      const successCount = extractionResults.filter(r => r.success).length;
      if (successCount === extractionResults.length) {
        showToast(`Successfully extracted text from ${successCount} files`, "success");
      } else {
        showToast(`Extracted from ${successCount}/${extractionResults.length} files with some errors`, "warning");
      }
    } catch (error) {
      console.error("Extraction process failed:", error);
      setError(`Extraction failed: ${error.message}`);
      showToast("Extraction failed - please check console for details", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // AI Processing with updated retry logic
  const processWithAI = async () => {
    if (!extractedTexts.length) {
      setError("Please extract text first");
      showToast("Please extract text first", "error");
      return;
    }

    setAiLoading(true);
    setError("");
    setStructuredDocument("");
    showToast("Processing with AI...", "info");

    try {
      const combinedText = extractedTexts
        .map(result => `=== ${result.type} File: ${result.fileName} ===\n${result.text}`)
        .join("\n\n");

      const prompt = `Transform this engineering content into a structured document:\n\n` +
        `Document Specifications:\n${documentSpec}\n\n` +
        `Raw Content:\n${combinedText}\n\n` +
        `Format with:\n- Proper headings\n- Technical sections\n- Consistent terminology`;

      // Try Gemini API (updated endpoint)
      try {
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${AI_CONFIG.gemini.apiKey}`,
          {
            method: "POST",
            headers: AI_CONFIG.gemini.headers,
            body: JSON.stringify({
              contents: [{
                parts: [{ text: prompt }]
              }]
            })
          }
        );

        if (geminiResponse.ok) {
          const data = await geminiResponse.json();
          const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (aiResponse) {
            setStructuredDocument(aiResponse);
            showToast("Document structured using Gemini AI", "success");
            return;
          }
        }
      } catch (geminiError) {
        console.warn("Gemini API failed:", geminiError);
      }

      // Fallback to OpenAI with retry logic
      try {
        let retryCount = 0;
        const maxRetries = 3;
        let lastError = null;
        
        while (retryCount < maxRetries) {
          try {
            const openaiResponse = await fetch(
              AI_CONFIG.openai.endpoint,
              {
                method: "POST",
                headers: AI_CONFIG.openai.headers,
                body: JSON.stringify({
                  model: "gpt-3.5-turbo",
                  messages: [{
                    role: "user",
                    content: prompt
                  }],
                  temperature: 0.7
                })
              }
            );

            if (openaiResponse.ok) {
              const data = await openaiResponse.json();
              const aiResponse = data.choices?.[0]?.message?.content;
              if (aiResponse) {
                setStructuredDocument(aiResponse);
                showToast("Document structured using OpenAI", "success");
                return;
              }
            } else if (openaiResponse.status === 429) {
              // Calculate wait time with exponential backoff
              const waitTime = Math.pow(2, retryCount) * 1000;
              await new Promise(resolve => setTimeout(resolve, waitTime));
              retryCount++;
              continue;
            }
          } catch (openaiError) {
            lastError = openaiError;
            retryCount++;
            if (retryCount < maxRetries) {
              const waitTime = Math.pow(2, retryCount) * 1000;
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
        throw lastError || new Error("OpenAI request failed after retries");
      } catch (openaiError) {
        console.warn("OpenAI API failed:", openaiError);
      }

      // Final fallback to local formatting
      if (AI_CONFIG.fallbackToLocal) {
        setError("AI services unavailable - using local formatting");
        showToast("AI services unavailable - using local formatting", "warning");
        
        const localFormatted = `# Engineering Document\n\n` +
          `## Compiled from extracted content\n\n` +
          `### Document Specification\n${documentSpec}\n\n` +
          extractedTexts.map(t => 
            `### ${t.fileName} (${t.type})\n\n${t.text}`
          ).join('\n\n');
        
        setStructuredDocument(localFormatted);
      } else {
        throw new Error("All AI endpoints failed and fallback is disabled");
      }
    } catch (error) {
      console.error("Document processing failed:", error);
      setError(`Document processing failed: ${error.message}`);
      showToast("Document processing failed", "error");
    } finally {
      setAiLoading(false);
    }
  };

  // PDF Generation
  const handleGenerateFinalPDF = () => {
    if (!structuredDocument) {
      setError("No structured document available");
      showToast("No structured document available", "error");
      return;
    }

    try {
      const doc = new jsPDF();
      let yPos = 20;
      const linesPerPage = Math.floor((doc.internal.pageSize.height - 40) / 7);
      const pageWidth = doc.internal.pageSize.width;
      
      // Title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Engineering Automation Document", pageWidth / 2, 15, { align: "center" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");

      // Process content with improved formatting
      const sections = structuredDocument.split(/\n\s*\n/);
      
      sections.forEach(section => {
        if (yPos > doc.internal.pageSize.height - 20) {
          doc.addPage();
          yPos = 20;
        }

        if (section.startsWith("# ")) {
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.text(section.replace("# ", ""), pageWidth / 2, yPos, { align: "center" });
          yPos += 12;
        } 
        else if (section.startsWith("## ")) {
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.text(section.replace("## ", ""), 15, yPos);
          yPos += 10;
        }
        else if (section.startsWith("### ")) {
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.text(section.replace("### ", ""), 20, yPos);
          yPos += 8;
        }
        else if (section.startsWith("#### ")) {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bolditalic");
          doc.text(section.replace("#### ", ""), 25, yPos);
          yPos += 7;
        }
        else {
          doc.setFontSize(11);
          doc.setFont("helvetica", "normal");
          
          const textLines = doc.splitTextToSize(section, pageWidth - 30);
          for (let i = 0; i < textLines.length; i++) {
            if (yPos > doc.internal.pageSize.height - 20) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(textLines[i], 15, yPos);
            yPos += 6;
          }
        }
        
        yPos += 4; // Add spacing between sections
      });

      const fileName = `engineering_document_${new Date().toISOString().slice(0,10)}.pdf`;
      doc.save(fileName);
      showToast(`PDF "${fileName}" generated successfully`, "success");
    } catch (error) {
      console.error("PDF generation failed:", error);
      setError(`PDF generation failed: ${error.message}`);
      showToast("PDF generation failed", "error");
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(structuredDocument);
      showToast("Document copied to clipboard!", "success");
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Failed to copy to clipboard", "error");
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <ToastContainer />
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-6 md:p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              ReqFlow.ai - Automated Requirements Engineering System
            </h1>
            <p className="text-lg text-gray-600">
              Transform multiple files into professionally structured technical documents
            </p>
          </div>

          {/* Document Specification */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Document Specification
              </label>
              <button 
                onClick={() => setDocumentSpec(`Create a comprehensive engineering document with these sections:
1. Executive Summary
2. Technical Specifications
3. System Architecture
4. Implementation Details
5. Test Results
6. Conclusion
    
Format requirements:
- Use Markdown-style headings (#, ##, ###)
- Maintain technical accuracy
- Standardize units and terminology
- Include all relevant data`)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Reset to Default
              </button>
            </div>
            <textarea
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-40"
              value={documentSpec}
              onChange={(e) => setDocumentSpec(e.target.value)}
              placeholder="Describe how you want the final document structured..."
            />
          </div>

          {/* File Upload Section */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Upload Engineering Documents
              </label>
              <div className="flex space-x-2">
                <button 
                  onClick={triggerFileInput}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                  </svg>
                  Add Files
                </button>
                {files.length > 0 && (
                  <button 
                    onClick={clearAllFiles}
                    className="text-sm text-red-600 hover:text-red-800 flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                    Clear All
                  </button>
                )}
              </div>
            </div>
            
            <div 
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition-colors duration-200"
              onClick={triggerFileInput}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
                onChange={handleFileChange}
                multiple
              />
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
              </svg>
              <p className="mt-2 text-sm text-gray-600">
                {files.length ? `${files.length} files selected` : "Drag and drop files here, or click to select"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Supported formats: PDF, Word, Excel, Images
              </p>
            </div>
          </div>

          {/* Selected Files List */}
          {files.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Selected Files</h2>
              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
                  {files.map((file, index) => {
                    const fileType = getFileType(file.name);
                    return (
                      <li key={index} className="px-4 py-3 hover:bg-gray-100 transition-colors duration-150">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center min-w-0">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${fileType.color} mr-3`}>
                              {fileType.name}
                            </span>
                            <span className="truncate">{file.name}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-xs text-gray-500 mr-3">
                              {(file.size / 1024).toFixed(1)} KB
                            </span>
                            <button 
                              onClick={() => removeFile(index)}
                              className="text-gray-400 hover:text-red-500 transition-colors duration-200"
                              title="Remove file"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                              </svg>
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <button
              onClick={handleExtractText}
              disabled={!files.length || isLoading}
              className={`px-6 py-3 rounded-lg font-medium flex items-center justify-center ${
                !files.length || isLoading ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"
              } transition-colors duration-200 min-w-40`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Extracting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path>
                  </svg>
                  Extract Text
                </>
              )}
            </button>
            
            <button
              onClick={processWithAI}
              disabled={!extractedTexts.length || aiLoading}
              className={`px-6 py-3 rounded-lg font-medium flex items-center justify-center ${
                !extractedTexts.length || aiLoading ? "bg-gray-300 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700 text-white"
              } transition-colors duration-200 min-w-40`}
            >
              {aiLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                  </svg>
                  Structure Document
                </>
              )}
            </button>
            
            <button
              onClick={handleGenerateFinalPDF}
              disabled={!structuredDocument}
              className={`px-6 py-3 rounded-lg font-medium flex items-center justify-center ${
                !structuredDocument ? "bg-gray-300 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white"
              } transition-colors duration-200 min-w-40`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
              Generate PDF
            </button>

            {structuredDocument && (
              <button
                onClick={copyToClipboard}
                className="px-6 py-3 rounded-lg font-medium flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-800 transition-colors duration-200 min-w-40"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
                </svg>
                Copy Text
              </button>
            )}
          </div>

          {/* Status Indicators */}
          {(isLoading || aiLoading) && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg flex items-center">
              <svg className="animate-spin mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div>
                <strong>{isLoading ? "Extracting text from files..." : "Processing document with AI..."}</strong>
                <p className="text-sm mt-1">This may take a few moments depending on file sizes</p>
              </div>
            </div>
          )}

          {/* Updated Error Message Component */}
          {error && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg">
              <div className="flex items-start">
                <svg className="flex-shrink-0 mr-3 h-5 w-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <strong>Notice:</strong> {error}
                  {error.includes("AI services unavailable") && (
                    <div className="mt-2 text-sm">
                      The document has been formatted with basic structure. For enhanced formatting, please ensure:
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>Your API keys are correctly configured</li>
                        <li>You have sufficient API credits</li>
                        <li>The AI service is available</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Extracted Text Preview */}
          {extractedTexts.length > 0 && !structuredDocument && (
            <div className="mb-8">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-medium text-gray-700">Extracted Content Preview</h2>
                <span className="text-sm text-gray-500">
                  {extractedTexts.filter(r => r.success).length}/{extractedTexts.length} files extracted successfully
                </span>
              </div>
              <div className="space-y-4">
                {extractedTexts.map((result, index) => (
                  <div 
                    key={index} 
                    className={`p-4 rounded-lg border ${
                      result.success ? "bg-gray-50 border-gray-200" : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className={`font-medium ${
                        result.success ? "text-gray-700" : "text-red-700"
                      }`}>
                        {result.fileName} <span className="text-sm opacity-75">({result.type})</span>
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        result.success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}>
                        {result.success ? "Success" : "Error"}
                      </span>
                    </div>
                    <div 
                      className={`text-sm max-h-40 overflow-y-auto font-mono ${
                        result.success ? "text-gray-600" : "text-red-600"
                      }`}
                    >
                      {result.text.length > 1000 
                        ? `${result.text.substring(0, 1000)}... [content truncated]` 
                        : result.text}
                    </div>
                    {!result.success && (
                      <p className="mt-2 text-xs text-red-600">
                        Tip: Try checking the file format or using a different file
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Structured Document Preview */}
          {structuredDocument && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-medium text-gray-700">Final Document Preview</h2>
                <div className="flex space-x-3">
                  <button 
                    onClick={copyToClipboard}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
                    </svg>
                    Copy
                  </button>
                  <button 
                    onClick={() => setStructuredDocument("")}
                    className="text-sm text-gray-600 hover:text-gray-800 flex items-center"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                    Clear
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                  {structuredDocument.length > 5000
                    ? `${structuredDocument.substring(0, 5000)}... [preview truncated]`
                    : structuredDocument}
                </pre>
              </div>
              <div className="mt-2 flex justify-between items-center text-xs text-gray-500">
                <span>
                  {Math.ceil(structuredDocument.length / 1000)}k characters • {structuredDocument.split('\n').length} lines
                </span>
                <span>
                  {error.includes("AI services unavailable") ? "Locally formatted" : "AI structured"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;