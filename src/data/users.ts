export interface InternalUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar?: string;
  role: 'owner' | 'admin' | 'manager' | 'viewer';
  status: 'active' | 'inactive' | 'pending';
  department?: string;
  permissions: string[];
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export const internalUsers: InternalUser[] = [];

export const rootUser = internalUsers[0];

// Helper functions for user management
export const getUserById = (id: string): InternalUser | undefined => {
  return internalUsers.find(user => user.id === id);
};

export const getUsersByRole = (role: InternalUser['role']): InternalUser[] => {
  return internalUsers.filter(user => user.role === role);
};

export const getActiveUsers = (): InternalUser[] => {
  return internalUsers.filter(user => user.status === 'active');
};

export const getUsersByDepartment = (department: string): InternalUser[] => {
  return internalUsers.filter(user => user.department === department);
};

export const addUser = (user: Omit<InternalUser, 'id' | 'createdAt' | 'updatedAt'>): InternalUser => {
  const newUser: InternalUser = {
    ...user,
    id: (internalUsers.length + 1).toString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  internalUsers.push(newUser);
  return newUser;
};

export const updateUser = (id: string, updates: Partial<InternalUser>): InternalUser | null => {
  const userIndex = internalUsers.findIndex(user => user.id === id);
  if (userIndex === -1) return null;
  
  internalUsers[userIndex] = {
    ...internalUsers[userIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  return internalUsers[userIndex];
};

export const deleteUser = (id: string): boolean => {
  const userIndex = internalUsers.findIndex(user => user.id === id);
  if (userIndex === -1) return false;
  
  internalUsers.splice(userIndex, 1);
  return true;
};
