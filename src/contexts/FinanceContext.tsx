import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface FinanceDateRange {
  startDate: string;
  endDate: string;
}

interface FinanceContextType {
  dateRange: FinanceDateRange;
  setDateRange: (range: FinanceDateRange) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<FinanceDateRange>({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <FinanceContext.Provider value={{ dateRange, setDateRange, refreshTrigger, triggerRefresh }}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (context === undefined) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
}
