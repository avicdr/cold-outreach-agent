'use client';

import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemName?: string;
  className?: string;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemName = 'items',
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  // Generate page numbers with smart ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);

      if (start > 2) {
        pages.push('ellipsis-start');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('ellipsis-end');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-3.5 px-4 rounded-[14px] border border-[rgba(243,240,232,0.08)] bg-[#171614] text-xs text-[#9E9B93] select-none ${className}`}
      aria-label="Pagination Navigation"
    >
      {/* Left: Summary and Page Size */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[#D0CBC1]">
          Showing <span className="font-semibold text-[#F3F0E8] font-mono">{startItem}</span> to{' '}
          <span className="font-semibold text-[#F3F0E8] font-mono">{endItem}</span> of{' '}
          <span className="font-semibold text-[#F3F0E8] font-mono">{totalItems.toLocaleString()}</span>{' '}
          {itemName}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-[rgba(243,240,232,0.08)]">
            <span className="text-[#9E9B93]">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                onPageSizeChange(newSize);
                onPageChange(1);
              }}
              className="bg-[#111110] border border-[rgba(243,240,232,0.12)] hover:border-[rgba(243,240,232,0.20)] text-[#F3F0E8] rounded-[6px] px-2 py-1 text-xs focus:outline-none focus:border-[#E84B2C] cursor-pointer font-mono transition-colors"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt} className="bg-[#171614] text-[#F3F0E8]">
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Buttons */}
      <div className="flex items-center gap-1 font-mono">
        {/* First Page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safeCurrentPage <= 1}
          title="First Page"
          className="p-1.5 rounded-[6px] border border-[rgba(243,240,232,0.08)] bg-[#111110] hover:bg-[#26201B] text-[#9E9B93] hover:text-[#F3F0E8] disabled:opacity-30 disabled:hover:bg-[#111110] disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1}
          title="Previous Page"
          className="p-1.5 rounded-[6px] border border-[rgba(243,240,232,0.08)] bg-[#111110] hover:bg-[#26201B] text-[#9E9B93] hover:text-[#F3F0E8] disabled:opacity-30 disabled:hover:bg-[#111110] disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Numeric Page Buttons */}
        <div className="flex items-center gap-1 mx-1">
          {pageNumbers.map((p, idx) => {
            if (typeof p === 'string') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-2 py-1 text-[#9E9B93] select-none font-mono"
                >
                  •••
                </span>
              );
            }

            const isActive = p === safeCurrentPage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={isActive ? 'page' : undefined}
                className={`min-w-[28px] h-7 px-2 rounded-[6px] text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#E84B2C] text-white shadow-[0_2px_8px_rgba(232,75,44,0.35)]'
                    : 'bg-[#111110] border border-[rgba(243,240,232,0.08)] text-[#D0CBC1] hover:bg-[#26201B] hover:text-[#F3F0E8]'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= totalPages}
          title="Next Page"
          className="p-1.5 rounded-[6px] border border-[rgba(243,240,232,0.08)] bg-[#111110] hover:bg-[#26201B] text-[#9E9B93] hover:text-[#F3F0E8] disabled:opacity-30 disabled:hover:bg-[#111110] disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safeCurrentPage >= totalPages}
          title="Last Page"
          className="p-1.5 rounded-[6px] border border-[rgba(243,240,232,0.08)] bg-[#111110] hover:bg-[#26201B] text-[#9E9B93] hover:text-[#F3F0E8] disabled:opacity-30 disabled:hover:bg-[#111110] disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
