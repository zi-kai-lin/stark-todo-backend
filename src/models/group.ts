export interface Group {
    groupId: number;
    name: string;
    description: string | null;
    createdBy: number;
    createdAt: Date;
    role: string; // 'admin' or 'member'
}
