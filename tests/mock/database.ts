// tests/mocks/database.ts
import { mock } from 'jest-mock-extended';
import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

// Create basic mocks
export const mockConnection = mock<PoolConnection>();
export const mockPool = mock<Pool>();

// Set up only essential implementations
mockPool.getConnection.mockImplementation(() => Promise.resolve(mockConnection));

// Clear mocks between tests
export const resetMocks = () => {
  jest.clearAllMocks();
  
  // Restore only essential implementations after clearing
  mockPool.getConnection.mockImplementation(() => Promise.resolve(mockConnection));
};

export const createMockResultSetHeader = (insertId: number = 1, affectedRows: number = 1): ResultSetHeader => ({
    insertId,
    affectedRows,
    changedRows: affectedRows,
    fieldCount: 0,
    info: '',
    serverStatus: 0,
    warningStatus: 0
  } as ResultSetHeader);

export const createMockRowDataPacket = <T extends Record<string, any>>(data: T): T & RowDataPacket => {
  return { ...data } as T & RowDataPacket;
};

// For connection failure testing
export const mockConnectionError = () => {
  mockPool.getConnection.mockImplementationOnce(() => Promise.reject(new Error('Connection failed')));
};

// For database operation failures
export const mockExecuteError = (error: Error) => {
  mockConnection.execute.mockImplementationOnce(() => Promise.reject(error));
};

// Mock successful database operations
export const mockSuccessfulInsert = (insertId: number = 1) => {
  const result = createMockResultSetHeader(insertId, 1);
  mockConnection.execute.mockResolvedValueOnce([result, []]);
  return result;
};

export const mockSuccessfulSelect = <T extends Record<string, any>>(rows: T[]) => {
  const mockRows = rows.map(row => createMockRowDataPacket(row));
  mockConnection.execute.mockResolvedValueOnce([mockRows, []]);
  return mockRows;
};

export const mockSuccessfulUpdate = (affectedRows: number = 1) => {
  const result = createMockResultSetHeader(0, affectedRows);
  mockConnection.execute.mockResolvedValueOnce([result, []]);
  return result;
};

export const mockSuccessfulDelete = (affectedRows: number = 1) => {
  const result = createMockResultSetHeader(0, affectedRows);
  mockConnection.execute.mockResolvedValueOnce([result, []]);
  return result;
};