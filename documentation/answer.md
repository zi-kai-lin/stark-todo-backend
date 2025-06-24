# 文字功能規劃/設計

## 實現訊息提醒任務即將到期

### 新增 table : ``task_due_notifications``（任務到期通知表）
儲存即將到期任務的通知資料以提供用戶通知

**欄位：**
- `notification_id` - INT AUTO_INCREMENT PRIMARY KEY - 通知ID
- `user_id` - INT NOT NULL - 用戶ID
- `task_id` - INT NOT NULL - 任務ID
- `due_date` - DATE NOT NULL - 到期日期
- `notification_type` - ENUM('owner', 'assigned', 'watcher') NOT NULL - 通知類型
- `created_at` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP - 建立時間

**外鍵：**
- `user_id` → `users.user_id` ON DELETE CASCADE
- `task_id` → `tasks.task_id` ON DELETE CASCADE

**索引：**
- `idx_user_due_date` - UNIQUE KEY (`user_id`, `task_id`) - 防止重複通知
- `idx_user_id_due_date` - 優化用戶通知查詢
- `idx_due_date` - 優化日期範圍清理作業

---
### 流程
#### 後端服務每天定時查看即將完成的任務 (e.g. cronjob)

- 需要制定 最早通知日期 (e.g. 3 日內)
- 自動清理過期通知記錄
- 任務異動時即時更新通知表
    - 條件：未完成 && (dueDate - today) <= maxNotificationDay

#### 在 使用者（create, update, delete) 的動作後跟新以上table
- 確保是 未完成 （不包含null) 和 通報 range 內的任務
- if (not completed && (today - dueDate) <= max NotificationDay)
  
#### API 設計
- 取得用戶通知：GET /user/notifications/due ，  checkNotifications(userId, range=1|3|7) #可直接 select 以上的 table 來節選日期
  - 查詢參數：range (1|3|7) 天數篩選
  - 回傳即將到期任務列表

 




## 實現定時重復任務功能

### 新增 table : ``recurring_scheduled_tasks``
儲存重復任務的相關訊息

**欄位：**
- `schedule_id` - INT AUTO_INCREMENT PRIMARY KEY - 排程ID
- `task_id` - INT NOT NULL - 任務ID
- `repeat_interval_days` - INT NOT NULL - 重複間隔天數
- `next_due_date` - DATE NOT NULL - 下次到期日期
- `is_active` - BOOLEAN DEFAULT TRUE - 是否啟用排程
- `total_completions` - INT DEFAULT 0 - 總完成次數
- `created_at` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP - 建立時間

**外鍵：**
- `task_id` → `tasks.task_id` ON DELETE CASCADE
 - 刪除任務連帶刪除相關重復排程

**索引：**
- `idx_task_id` 
- `idx_next_due_date`
- `idx_is_active`

---

### 流程

#### 創建重複任務
- 用戶創建母任務時可指定重複間隔



#### 後端服務每天定時查看需要重復的任務 (e.g. cronjob)

- 如果 due_date 到期 更新 `scheduled_tasks`:
    - 重置任務狀態：
        - `tasks.completed` = FALSE
        - `tasks.due_date` = 今天  
    - 更新排程：
        - `tasks.completed` = FALSE >> TRUE
        - `next_due_date` = 今天 + `repeat_interval_days`


### API 設計
- 創建重複任務：POST /tasks (如果含 repeat_interval_days parameter 就無視原本的 dueDate)
- 查詢重複任務：GET /tasks/recurring
 - 回傳任務排程訊息
- 停用/啟用排程：PUT /tasks/{id}/schedule
 - 更新排程 `is_active` 狀態
- 取得完成統計：GET /tasks/{id}/completions
 - 回傳 `total_completions` 和完成歷史