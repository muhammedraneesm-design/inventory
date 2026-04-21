import React, { useRef } from 'react';
import Barcode from 'react-barcode';
import { Printer, X } from 'lucide-react';

interface BarcodeLabelProps {
  value: string;
  label?: string;
  subLabel?: string;
  onClose: () => void;
}

export function BarcodeLabel({ value, label, subLabel, onClose }: BarcodeLabelProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Barcode Label</title>
          <style>
            body { 
              margin: 0; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh;
              font-family: sans-serif;
            }
            .label-container {
              text-align: center;
              padding: 20px;
              border: 1px solid #eee;
              width: fit-content;
            }
            .label-title { font-weight: bold; margin-bottom: 5px; font-size: 14px; }
            .label-subtitle { font-size: 10px; color: #666; margin-bottom: 10px; }
            @media print {
              .no-print { display: none; }
              body { height: auto; }
              .label-container { border: none; }
            }
          </style>
        </head>
        <body>
          <div class="label-container">
            ${label ? `<div class="label-title">${label}</div>` : ''}
            ${subLabel ? `<div class="label-subtitle">${subLabel}</div>` : ''}
            ${printContent.innerHTML}
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl space-y-6 text-center">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xl font-bold text-zinc-900">Barcode Label</h3>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100 flex flex-col items-center justify-center">
          {label && <p className="text-sm font-bold text-zinc-900 mb-1">{label}</p>}
          {subLabel && <p className="text-[10px] text-zinc-500 mb-4 uppercase tracking-widest">{subLabel}</p>}
          <div ref={printRef} className="bg-white p-4 rounded-lg border border-zinc-200">
            <Barcode 
              value={value} 
              width={1.5} 
              height={60} 
              fontSize={12}
              margin={0}
              background="transparent"
            />
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="w-full bg-zinc-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
        >
          <Printer size={20} />
          Print Label
        </button>
      </div>
    </div>
  );
}
