# 資料架構

## 設計

### users (用戶)
儲存用戶帳號和身份驗證資料。

**欄位：**
- `user_id` - INT AUTO_INCREMENT PRIMARY KEY - 用戶id
- `username` - VARCHAR(255) NOT NULL UNIQUE - 名稱（唯一）
- `password` - VARCHAR(255) NOT NULL - HASHED 加密密碼
- `created_at` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP - 建立時間

**索引：**
- `idx_username` - 優化用戶名查詢

### tasks（任務）
任務資料，母子使用同一個 table, 子任務以 parent ID 鏈接到母任務。

**欄位：**
- `task_id` - INT AUTO_INCREMENT PRIMARY KEY - 任務id
- `description` - TEXT NOT NULL - 描述
- `date_created` - DATETIME DEFAULT CURRENT_TIMESTAMP - 建立時間
- `due_date` - DATE NULL - 完成日期
- `completed` - BOOLEAN DEFAULT FALSE - 完成狀態
- `parent_id` - INT NULL - 母任務 ID
- `owner_id` - INT NOT NULL - 任務擁有者
- `group_id` - INT NULL - 所屬群組

**外鍵：**
- `parent_id` → `tasks.task_id` ON DELETE CASCADE - 刪除母任務連帶刪除子任務
- `owner_id` → `users.user_id` ON DELETE CASCADE - 刪除用戶連帶刪除任務
- `group_id` → `task_groups.group_id` ON DELETE CASCADE - 刪除任務所在群組連帶刪除任務

**索引：**
- `idx_completed` - 優化完成狀態篩選
- `idx_due_date` - 優化截止日期排序
- `idx_owner_id` - 優化擁有者查詢
- `idx_group_id` - 優化群組任務查詢
- `idx_date_created` - 優化建立時間排序
- `idx_completed_due_date` - 複合索引，優化完成狀態與截止日期聯合查詢


### task_groups（任務群組表）
分享團隊，用於共享任務。

**欄位：**
- `group_id` - INT AUTO_INCREMENT PRIMARY KEY - 群組ID
- `name` - VARCHAR(255) NOT NULL - 名稱
- `description` - TEXT - 描述
- `created_by` - INT NOT NULL - 建立者
- `created_at` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP - 建立時間

**外鍵：**
- `created_by` → `users.user_id` ON DELETE CASCADE 刪除使用者連帶刪除擁有團隊

**索引：**
- `idx_created_by` - 優化建立者查詢


### group_members（群組成員表）
群組成員資格和角色管理。

**欄位：**
- `group_id` - INT NOT NULL - 群組 ID
- `user_id` - INT NOT NULL - 用戶 ID
- `role` - ENUM('admin', 'member') DEFAULT 'member' - 成員角色權限
- `join_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP - 加入時間

**主鍵：**
- PRIMARY KEY (`group_id`, `user_id`)

**外鍵：**
- `group_id` → `task_groups.group_id` ON DELETE CASCADE 團隊刪除後刪除所屬成員

**索引：**
- `idx_group_id` - 優化群組成員查詢
- `idx_user_id` - 優化用戶群組查詢

### task_assigned（任務指派表）
記錄被指派執行任務的用戶。

**欄位：**
- `task_id` - INT NOT NULL - 任務 ID
- `user_id` - INT NOT NULL - 被指派用戶 ID

**主鍵：**
- PRIMARY KEY (`task_id`, `user_id`)

**外鍵：**
- `task_id` → `tasks.task_id` ON DELETE CASCADE  任務刪除，指派/關注 會被刪除

**索引：**
- `idx_task_id` - 優化任務執行者查詢
- `idx_user_id` - 優化用戶被指派任務查詢

### task_watchers（任務關注表）
記錄關注任務的用戶。

**欄位：**
- `task_id` - INT NOT NULL - 任務 ID
- `user_id` - INT NOT NULL - 關注者 ID

**主鍵：**
- PRIMARY KEY (`task_id`, `user_id`) - 複合主鍵

**外鍵：**
- `task_id` → `tasks.task_id` ON DELETE CASCADE
- `user_id` → `users.user_id` ON DELETE CASCADE

**索引：**
- `idx_task_id` - 優化任務關注者查詢
- `idx_user_id` - 優化用戶關注任務查詢

### task_comments（任務評論表）
任務相關評論。

**欄位：**
- `comment_id` - INT AUTO_INCREMENT PRIMARY KEY - 評論 ID
- `task_id` - INT NOT NULL - 任務 ID
- `user_id` - INT NOT NULL - 評論者 ID
- `content` - TEXT NOT NULL - 內容
- `created_at` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP - 建立時間

**外鍵：**
- `task_id` → `tasks.task_id` ON DELETE CASCADE  任務刪除，評論怒連帶被刪除

**索引：**
- `idx_task_id` - 優化任務評論查詢
- `idx_created_at` - 優化時間排序



