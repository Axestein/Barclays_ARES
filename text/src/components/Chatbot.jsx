import React, { useState, useRef, useEffect } from 'react';
import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min?url";
import { read, utils } from "xlsx";
import mammoth from "mammoth";
import Tesseract from "tesseract.js";
import { jsPDF } from "jspdf";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = worker;

// AI Service Configuration
const AI_CONFIG = {
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
    apiKey: "AIzaSyBIG7T9Le8HEhCd_qeCMP_BCZCKRSSBhAs",
    headers: { "Content-Type": "application/json" }
  },
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKey: "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",
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
  // Chat state
  const [messages, setMessages] = useState([
    { 
      id: 1, 
      type: 'bot', 
      content: 'Welcome to Document Processor AI. You can upload multiple files (PDF, Word, Excel, Images) and I will extract and structure the content for you.' 
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [files, setFiles] = useState([]);
  const [extractedTexts, setExtractedTexts] = useState([]);
  const [structuredDocument, setStructuredDocument] = useState("");
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      showToast("Please select files first", "error");
      return;
    }

    setIsTyping(true);
    
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

      // Add message with extraction results
      const botMessage = {
        id: messages.length + 2,
        type: 'bot',
        content: `I've successfully extracted text from ${successCount} of ${extractionResults.length} files. Would you like me to structure this into a document?`,
        action: 'ask_structure'
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Extraction process failed:", error);
      showToast("Extraction failed - please check console for details", "error");
      
      const botMessage = {
        id: messages.length + 2,
        type: 'bot',
        content: `I encountered an error processing your files: ${error.message}`,
        isError: true
      };
      setMessages(prev => [...prev, botMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const processWithAI = async () => {
    if (!extractedTexts.length) {
      showToast("No extracted text available", "error");
      return;
    }

    setIsTyping(true);
    
    try {
      const combinedText = extractedTexts
        .map(result => `=== ${result.type} File: ${result.fileName} ===\n${result.text}`)
        .join("\n\n");

      const prompt = `Transform this content into a well-structured document with these sections:
1. Summary of Key Information
2. Important Data Points
3. Key Findings
4. Recommendations (if applicable)
5. References to Source Documents

Format requirements:
- Use Markdown-style headings (#, ##, ###)
- Maintain original data accuracy
- Standardize units and terminology
- Include all relevant data

Content to process:
${combinedText}`;

      // Try Gemini first
      try {
        const geminiResponse = await fetch(
          `${AI_CONFIG.gemini.endpoint}?key=${AI_CONFIG.gemini.apiKey}`,
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
            
            const botMessage = {
              id: messages.length + 2,
              type: 'bot',
              content: "I've structured the document from your files. Here's the result:",
              structuredContent: aiResponse
            };
            setMessages(prev => [...prev, botMessage]);
            return;
          }
        }
      } catch (geminiError) {
        console.warn("Gemini API failed:", geminiError);
      }

      // Fallback to OpenAI
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
            
            const botMessage = {
              id: messages.length + 2,
              type: 'bot',
              content: "I've structured the document from your files. Here's the result:",
              structuredContent: aiResponse
            };
            setMessages(prev => [...prev, botMessage]);
            return;
          }
        }
      } catch (openaiError) {
        console.warn("OpenAI API failed:", openaiError);
      }

      // Final fallback to local formatting
      if (AI_CONFIG.fallbackToLocal) {
        const localFormatted = `# Document Summary\n\n` +
          `## Compiled from extracted content\n\n` +
          extractedTexts.map(t => 
            `### ${t.fileName} (${t.type})\n\n${t.text}`
          ).join('\n\n');
        
        setStructuredDocument(localFormatted);
        
        const botMessage = {
          id: messages.length + 2,
          type: 'bot',
          content: "AI services are currently unavailable. Here's a basic structure of your files:",
          structuredContent: localFormatted
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        throw new Error("All AI endpoints failed and fallback is disabled");
      }
    } catch (error) {
      console.error("Document processing failed:", error);
      showToast("Document processing failed", "error");
      
      const botMessage = {
        id: messages.length + 2,
        type: 'bot',
        content: `I encountered an error processing your documents: ${error.message}`,
        isError: true
      };
      setMessages(prev => [...prev, botMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerateFinalPDF = () => {
    if (!structuredDocument) {
      showToast("No structured document available", "error");
      return;
    }

    try {
      const doc = new jsPDF();
      let yPos = 20;
      const pageWidth = doc.internal.pageSize.width;
      
      // Title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Document Summary", pageWidth / 2, 15, { align: "center" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");

      // Process content
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
        
        yPos += 4;
      });

      // Add source files reference
      doc.addPage();
      yPos = 20;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Source Files", 15, yPos);
      yPos += 10;
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      extractedTexts.forEach(result => {
        doc.text(`${result.fileName} (${result.type})`, 20, yPos);
        yPos += 6;
      });

      const fileName = `document_summary_${new Date().toISOString().slice(0,10)}.pdf`;
      doc.save(fileName);
      showToast(`PDF "${fileName}" generated successfully`, "success");
      
      // Add message about PDF generation
      const botMessage = {
        id: messages.length + 1,
        type: 'bot',
        content: `I've generated a PDF document with the structured content. The file "${fileName}" has been downloaded.`
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("PDF generation failed:", error);
      showToast("PDF generation failed", "error");
      
      const botMessage = {
        id: messages.length + 1,
        type: 'bot',
        content: `I encountered an error generating the PDF: ${error.message}`,
        isError: true
      };
      setMessages(prev => [...prev, botMessage]);
    }
  };

  const handleSend = async () => {
    if (input.trim() === '' && files.length === 0) return;

    // Add user message
    const userMessage = {
      id: messages.length + 1,
      type: 'user',
      content: input,
      files: files.map(file => ({
        name: file.name,
        type: getFileType(file.name).name
      }))
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    
    // Process files if uploaded
    if (files.length > 0) {
      setFiles([]);
      await handleExtractText();
    } else {
      // Handle regular chat messages
      setIsTyping(true);
      
      setTimeout(() => {
        let response = "";
        if (input.toLowerCase().includes("hello") || input.toLowerCase().includes("hi")) {
          response = "Hello! How can I assist you with your documents today?";
        } else if (input.toLowerCase().includes("thank")) {
          response = "You're welcome! Let me know if you need anything else.";
        } else if (input.toLowerCase().includes("structure") || input.toLowerCase().includes("process")) {
          if (extractedTexts.length > 0) {
            response = "I can structure the documents you've uploaded. Would you like me to proceed?";
          } else {
            response = "Please upload some files first that you'd like me to process and structure.";
          }
        } else {
          response = "I'm an AI specialized in processing documents. You can upload files for me to extract and structure information from them.";
        }
        
        const botMessage = {
          id: messages.length + 2,
          type: 'bot',
          content: response
        };
        setMessages(prev => [...prev, botMessage]);
        setIsTyping(false);
      }, 1000);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter(file => {
      const { type } = getFileType(file.name);
      return type !== "unsupported";
    });

    if (validFiles.length !== selectedFiles.length) {
      showToast("Some files were ignored due to unsupported formats", "warning");
    }

    setFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (fileIndex) => {
    setFiles(files.filter((_, index) => index !== fileIndex));
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const handleAction = (action) => {
    if (action === 'structure_document') {
      processWithAI();
    } else if (action === 'generate_pdf') {
      handleGenerateFinalPDF();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-gray-100">
      <ToastContainer />
      
      {/* Header */}
      <header className="p-4 border-b border-gray-700 bg-gray-900 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">ReqFlow.ai</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button className="text-gray-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-medium">U</div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex">
        {/* Left Sidebar */}
        <div className="w-64 hidden md:block border-r border-gray-700 p-4 bg-gray-800 bg-opacity-50">
          <button className="w-full py-2 px-4 mb-4 rounded-lg bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white font-medium transition-all duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New Chat
          </button>
          
          <div className="space-y-2">
            <div className="text-sm text-gray-400 font-medium px-2 py-1">Recent Documents</div>
            <div className="bg-gray-700 bg-opacity-40 rounded-lg p-2 cursor-pointer hover:bg-gray-700">
              <div className="text-sm font-medium">Project Report</div>
              <div className="text-xs text-gray-400 truncate">Combined project documentation...</div>
            </div>
            <div className="bg-gray-700 bg-opacity-40 rounded-lg p-2 cursor-pointer hover:bg-gray-700">
              <div className="text-sm font-medium">Research Data</div>
              <div className="text-xs text-gray-400 truncate">Extracted research findings...</div>
            </div>
            <div className="bg-gray-700 bg-opacity-40 rounded-lg p-2 cursor-pointer hover:bg-gray-700">
              <div className="text-sm font-medium">Meeting Notes</div>
              <div className="text-xs text-gray-400 truncate">Consolidated meeting minutes...</div>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            <div className="space-y-6">
              {messages.map((message) => (
                <div 
                  key={message.id} 
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-3xl rounded-2xl px-4 py-3 ${
                      message.type === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : message.isError
                          ? 'bg-red-900 text-white rounded-bl-none'
                          : 'bg-gray-700 text-gray-100 rounded-bl-none'
                    }`}
                  >
                    {message.content}
                    
                    {message.files && message.files.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.files.map((file, index) => (
                          <div key={index} className="bg-gray-800 bg-opacity-40 rounded p-2 text-sm flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            {file.name} <span className="text-xs text-gray-400 ml-2">({file.type})</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {message.structuredContent && (
                      <div className="mt-4 bg-gray-800 rounded-lg p-3">
                        <pre className="whitespace-pre-wrap text-sm text-gray-100 font-mono max-h-64 overflow-y-auto">
                          {message.structuredContent.length > 1000
                            ? `${message.structuredContent.substring(0, 1000)}... [content truncated]`
                            : message.structuredContent}
                        </pre>
                        <div className="mt-3 flex space-x-2">
                          <button 
                            onClick={() => navigator.clipboard.writeText(message.structuredContent)}
                            className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
                          >
                            Copy Text
                          </button>
                          <button 
                            onClick={handleGenerateFinalPDF}
                            className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
                          >
                            Download PDF
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {message.action === 'ask_structure' && (
                      <div className="mt-3 flex space-x-2">
                        <button 
                          onClick={() => handleAction('structure_document')}
                          className="text-xs bg-green-600 hover:bg-green-700 px-2 py-1 rounded"
                        >
                          Yes, Structure It
                        </button>
                        <button 
                          onClick={() => setMessages(prev => [...prev, {
                            id: prev.length + 1,
                            type: 'bot',
                            content: 'Okay, let me know if you need anything else.'
                          }])}
                          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
                        >
                          Not Now
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 text-white rounded-2xl rounded-bl-none px-4 py-3">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* File Attachments */}
          {files.length > 0 && (
            <div className="px-4 py-2">
              <div className="bg-gray-800 rounded-lg p-2">
                <div className="text-sm text-gray-400 mb-2">Files to upload:</div>
                <div className="flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <div key={index} className="bg-gray-700 rounded-lg px-3 py-1 text-sm flex items-center">
                      <span className="truncate max-w-xs">{file.name}</span>
                      <button 
                        onClick={() => removeFile(index)}
                        className="ml-2 text-gray-400 hover:text-white"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t border-gray-700">
            <div className="relative rounded-lg bg-gray-700 flex items-end">
              <textarea
                className="w-full bg-transparent border-none focus:ring-0 resize-none p-4 text-white placeholder-gray-400 max-h-32"
                placeholder="Message DocProcessor AI or upload files..."
                rows="1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                style={{ minHeight: '56px' }}
              />
              <div className="flex items-center space-x-2 p-2">
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
                />
                <button 
                  onClick={triggerFileInput} 
                  className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-600"
                  title="Attach files"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                  </svg>
                </button>
                <button 
                  onClick={handleSend} 
                  className={`p-2 rounded-full ${input.trim() || files.length > 0 ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-600 text-gray-400'}`}
                  disabled={!input.trim() && files.length === 0}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Upload PDF, Word, Excel, or Image files to extract and structure their content.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;