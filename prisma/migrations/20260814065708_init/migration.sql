-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Division" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Division_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "departmentId" TEXT,
    "divisionId" TEXT,
    "teamId" TEXT,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "assigneeType" TEXT NOT NULL,
    "assignedDeptId" TEXT,
    "assignedDivId" TEXT,
    "assignedTeamId" TEXT,
    "assignedUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "completedAt" DATETIME,
    "transferred" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_assignedDeptId_fkey" FOREIGN KEY ("assignedDeptId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_assignedDivId_fkey" FOREIGN KEY ("assignedDivId") REFERENCES "Division" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkOrderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workOrderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "note" TEXT,
    "progress" INTEGER,
    "imagePath" TEXT,
    "filePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkOrderLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkOrderLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE INDEX "Division_departmentId_idx" ON "Division"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Division_departmentId_name_key" ON "Division"("departmentId", "name");

-- CreateIndex
CREATE INDEX "Team_divisionId_idx" ON "Team"("divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_divisionId_name_key" ON "Team"("divisionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "User_divisionId_idx" ON "User"("divisionId");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Project_categoryId_idx" ON "Project"("categoryId");

-- CreateIndex
CREATE INDEX "WorkOrder_projectId_idx" ON "WorkOrder"("projectId");

-- CreateIndex
CREATE INDEX "WorkOrder_parentId_idx" ON "WorkOrder"("parentId");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedDeptId_idx" ON "WorkOrder"("assignedDeptId");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedDivId_idx" ON "WorkOrder"("assignedDivId");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedTeamId_idx" ON "WorkOrder"("assignedTeamId");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedUserId_idx" ON "WorkOrder"("assignedUserId");

-- CreateIndex
CREATE INDEX "WorkOrderLog_workOrderId_idx" ON "WorkOrderLog"("workOrderId");
