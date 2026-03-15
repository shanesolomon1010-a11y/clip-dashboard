'use client';

import { createContext, useContext, useState } from 'react';
import { DateRange, Platform } from '@/types';

export type PlatformFilter = Platform | 'all';

interface FilterContextValue {
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  platform: PlatformFilter;
  setPlatform: (p: PlatformFilter) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function useFilter(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within FilterProvider');
  return ctx;
}

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [platform, setPlatform] = useState<PlatformFilter>('all');

  return (
    <FilterContext.Provider value={{ dateRange, setDateRange, platform, setPlatform }}>
      {children}
    </FilterContext.Provider>
  );
}
