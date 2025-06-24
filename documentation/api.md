# API 文件
## 概述

基本任務管理系統



**Base URL：** `/api/v1`

範例1： `http://localhost:4005/api/v1/auth/register`

範例2： `http://localhost:4005/api/v1/user/tasks`

鏈接 summary 可看 `/` i.e. `localhost:4005/`

## 身份驗證

以下 API 使用 HTTP-only Cookie 的 JWT。請求必須包含 `auth_token` cookie。

### Cookie 配置
- **名稱：** auth_token
- **HttpOnly：** true
- **Secure：** true
- **SameSite：** strict
- **有效期：** 7 天

## 錯誤回應格式

請求錯誤回應遵循統一格式：

```json
{
    "success": false,
    "category": "API類別",
    "error": {
        "code": "錯誤代碼",
        "message": "錯誤描述"
    },
    "timestamp": "2024-01-01T12:00:00.000Z"
  
}
```

### 錯誤代碼
- `VALIDATION_ERROR` - 輸入資料無效 (i.e. Duplicate entry checks)
- `UNAUTHORIZED_ERROR` - 身份驗證失敗
- `PERMISSION_ERROR` - 權限不足
- `NOT_FOUND` - 資源不存在
- `INVALID_FORMAT` - 請求格式無效
- `SERVER_ERROR` - 伺服器出錯


## 身份驗證相關 URL

### 使用者注冊
建立新用戶帳號，成功後 提供 cookie

**端點：** `POST /auth/register`

**請求主體：**
```json
{
  "username": "string",
  "password": "string"
}
```

**驗證規則：**
- 用戶名：3-50 個字符
- 密碼：必填

**成功回應 (201)：**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": 1,
      "username": "test"
    }
  },
   "timestamp": "2025-06-23T18:14:33.460Z"
}
```

**錯誤回應：**
- `400` - 無效的用戶名/密碼
- `409` - 用戶名已存在

### 登入
驗證用戶身份並取得身份驗證 cookie。

**端點：** `POST /auth/login`

**請求主體：**
```json
{
  "username": "string",
  "password": "string"
}
```

**成功回應 (200)：**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "username": "test"
    }
  }
}
```

**錯誤回應：**
- `401` - 用戶名或密碼無效

### 登出
清除身份驗證 cookie

**端點：** `POST /auth/logout`

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Authentication",
    "message": "Logout successful",
    "data": {},
    "timestamp": "2025-02-23T18:22:38.317Z"

}
```

---

## 使用者功能 ROUTE

### 取得當前用戶的任務列表
使用 cookie 內的 jwt 來判斷且取得現在用戶的任務列表。提供多個選項來進行節選，排序功能等。

**端點：** `POST /user/tasks`

**需要身份驗證：** 是

**請求主體：**
```json
{
  "mode": "personal|assigned|watching|group", 
  "dateOption": "YYYY-MM-DD", 
  "sortBy": "dueDate|dateCreated|owner|taskId",
  "groupOptions": {
    "groupId": 1,
    "ownerFilter": 2,
    "assignedFilter": true
  },
  "childViewOptions": {
    "showChild": false,
    "ownerExclusive": false,
    "sortChildren": false
  }
}
```

**參數說明：**
以下將以"使用者"來描述當前認證厚的用戶
- `mode`（必填）：篩選任務
  - `personal`：查看使用者自己建立的任務 
  - `assigned`：被指派給使用者任務
  - `watching`：使用者當前關注的任務
  - `group`：特定群組內的任務 （需提供 groupOptions) 
- `dateOption`：如果有提供將會 篩選（YYYY-MM-DD 格式）任務完成日期
- `sortBy`：結果排序（預設："dateCreated"）
- `groupOptions`：mode="group" 時必填
  - `groupId`（必填）：目標群組 ID
  - `ownerFilter`：按特定擁有者 ID 篩選
  - `assignedFilter`：僅顯示已在團體內被指派的任務
- `childViewOptions`：子任務顯示
  - `showChild`：回應包含子任務
  - `ownerExclusive`：僅顯示用戶建立的子任務
  - `sortChildren`：對子任務應用 sortBy （將會遵循 母任務的 排序規則，否則一律 dateCreated 預設排序

**成功回應 (200)：**
```json
{
    "success": true,
    "message": "Tasks retrieved successfully",
    "category": "User",

    "data": {
    "tasks": [
        {
        "task": {
            "taskId": 1,
            "description": "完成 API 文檔",
            "dueDate": "2024-02-01T00:00:00.000Z",
            "ownerId": 1,
            "groupId": null,
            "parentId": null,
            "completed": false,
            "dateCreated": "2024-01-01T12:00:00.000Z"
        },
        "children": []
        }
    ]
    },
    "timestamp": "2025-06-23T18:35:31.910Z"

}
```

---


### 取得當前用戶的分享團隊列表
檢索已驗證用戶所屬的所有群組。

**端點：** `GET /user/groups`

**需要身份驗證：** 是

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "User",
    "message": "User groups retrieved successfully",
    "data": {
    "groups": [
        {
        "groupId": 1,
        "name": "開發團隊",
        "description": "主要開發群組",
        "createdBy": 1,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "role": "admin"
        }
    ]
    }。
    "timestamp": "2025-06-23T18:39:54.452Z"
}
```


## 任務相關 ROUTE

### 建立任務
建立新任務（父任務或子任務）。

**端點：** `POST /task`

**需要身份驗證：** 是

**請求主體：**
```json
{
  "description": "string",
  "dueDate": "YYYY-MM-DD",
  "groupId": 1,
  "parentId": 2
}
```

**參數說明：**
- `description`（必填）：任務描述
- `dueDate`：截止日期（YYYY-MM-DD 格式）
- `groupId`：指派任務到群組
- `parentId`：父任務 ID（用於子任務）

**建立規則：**
- 子任務繼承母任務的 groupId
- 建立分享團隊任務需要群組成員資格

**成功回應 (201)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "Task created successfully",
    "data": {
        "task": {
            "taskId": 19,
            "description": "test",
            "dueDate": null,
            "ownerId": 3,
            "groupId": 1,
            "parentId": null,
            "completed": false,
            "dateCreated": "2025-06-23T18:45:11.000Z"
        }
    },
    "timestamp": "2025-06-23T18:45:11.658Z"
}
```

### 取得任務詳情
檢索任務及其子任務。

**端點：** `GET /task/:id`

**需要身份驗證：** 是

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "Task retrieved successfully",
    "data": {
        "task": {
            "task": {
                "taskId": 3,
                "description": "test",
                "dueDate": null,
                "ownerId": 3,
                "groupId": null,
                "parentId": null,
                "completed": false,
                "dateCreated": "2025-06-23T18:36:35.000Z"
            },
            "children": []
        }
    },
    "timestamp": "2025-06-23T18:48:19.197Z"
}
```

### 更新任務
更新任務屬性。

**端點：** `PATCH /task/:id`

**需要身份驗證：** 是

**請求主體：**
```json
{
  "description": "更新的描述",
  "dueDate": "2024-03-01",
  "groupId": 2,
  "completed": true
}
```

**跟新規則：**
- 子任務無法更新 groupId
- 母任務groupId更改會連帶更新子任務groupId
- 母任務完成後會連帶完成子任務
- 完成所有子任務會自動完成母任務
- 取消完成任何子任務會取消母任務的完成 status

**權限要求：**
- 個人任務：僅擁有者
- 群組任務：任何成員
- 群組變更：管理員或擁有者

### 刪除任務
刪除任務。

**端點：** `DELETE /task/:id`

**需要身份驗證：** 是

**刪除規則：**
- 刪除母務會刪除所有子任務
- 刪除最後一個未完成的子任務會完成母任務

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "Task deleted successfully",
    "data": {
        "deleted": true
    },
    "timestamp": "2025-06-23T19:04:28.129Z"
}
```

### 查看任務評論
檢索任務的所有評論。

**端點：** `GET /task/:id/comments`

**需要身份驗證：** 是

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "Comments retrieved successfully",
    "data": {
        "comments": [
            {
                "commentId": 1,
                "taskId": 11,
                "userId": 3,
                "content": "Hello there",
                "dateCreated": "2025-06-23T19:06:44.000Z",
                "username": "test"
            },
            {
                "commentId": 2,
                "taskId": 11,
                "userId": 3,
                "content": "Hello there",
                "dateCreated": "2025-06-23T19:06:50.000Z",
                "username": "test"
            }
        ]
    },
    "timestamp": "2025-06-23T19:07:54.861Z"
}
```

### 新增任務評論
為任務新增評論。

**端點：** `POST /task/:id/comments`

**需要身份驗證：** 是

**請求主體：**
```json
{
  "content": "string"
}
```

**成功回應 (201)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "Comment added successfully",
    "data": {
        "comment": {
            "commentId": 2,
            "taskId": 11,
            "userId": 3,
            "content": "Hello there",
            "dateCreated": "2025-06-23T19:06:50.000Z"
        }
    },
    "timestamp": "2025-06-23T19:06:50.726Z"
}
```

### 刪除任務評論
刪除任務的評論。

**端點：** `DELETE /task/:id/comments/:commentId`

**需要身份驗證：** 是

**成功回應 (201)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "Comment deleted successfully",
    "data": {
        "targetId": 2
    },
    "timestamp": "2025-06-23T19:09:23.639Z"
}
```
**權限要求：**
- 評論建立者
- 任務擁有者
- 群組管理員（群組任務）

### 新增任務關注者
將用戶新增為任務關注者。

**端點：** `POST /task/:id/watchers/:targetUserId`

**需要身份驗證：** 是

**權限要求：**
- 自行新增：任務擁有者或群組成員
- 新增他人：任務擁有者、母任務擁有者或群組管理員

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "User successfully added as watcher to task",
    "data": {
        "success": true
    },
    "timestamp": "2025-06-23T19:20:41.153Z"
}
```

### 移除任務關注者
移除任務的關注者。

**端點：** `DELETE /task/:id/watchers/:targetUserId`

**需要身份驗證：** 是

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "User successfully removed as watcher from task",
    "data": {
        "success": true
    },
    "timestamp": "2025-06-23T19:21:47.903Z"
}
```

### 指派任務執行者
指派用戶執行任務。

**端點：** `POST /task/:id/assigned/:targetUserId`

**需要身份驗證：** 是

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "User successfully added as assigned to task",
    "data": {
        "success": true
    },
    "timestamp": "2025-06-23T19:22:54.835Z"
}
```

### 解除任務執行者
解除用戶的任務指派。

**端點：** `DELETE /task/:id/assigned/:targetUserId`

**需要身份驗證：** 是

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "User successfully removed as assigned from task",
    "data": {
        "success": true
    },
    "timestamp": "2025-06-23T19:24:15.466Z"
}
```

### 取得任務執行者和關注者
檢索任務的所有執行者和關注者。

**端點：** `GET /task/:id/assigneesAndWatchers`

**需要身份驗證：** 是

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Task",
    "message": "Task users retrieved successfully",
    "data": {
        "task": {
            "id": 11,
            "assigned": [
                {
                    "userId": 4,
                    "username": "test4"
                }
            ],
            "watchers": [
                {
                    "userId": 4,
                    "username": "test4"
                }
            ]
        }
    },
    "timestamp": "2025-06-23T19:25:31.665Z"
}
```

---

## 分享團隊相關 ROUTE

### 建立團隊
建立新的任務團隊。

**端點：** `POST /group`

**需要身份驗證：** 是

**請求主體：**
```json
{
  "name": "string",
  "description": "string"
}
```

**驗證規則：**
- 名稱：1-100 個字符，必填，不能重復

**成功回應 (201)：**
```json
{
    "success": true,
    "category": "Group",
    "message": "Group created successfully",
    "data": {
        "group": {
            "groupId": 1,
            "name": "tester",
            "description": "group for testing",
            "createdBy": 3,
            "createdAt": "2025-06-23T18:44:22.000Z",
            "role": "admin"
        }
    },
    "timestamp": "2025-06-23T18:44:22.626Z"
}
```

### 刪除群組
刪除群組及所有相關任務。

**端點：** `DELETE /group/:id`

**需要身份驗證：** 是

**權限要求：** 僅群組管理員

**業務規則：**
- 連帶刪除所有群組任務
- 移除所有成員

### 新增群組成員
將用戶新增到群組。

**端點：** `POST /group/:id/users/:targetUserId`

**需要身份驗證：** 是

**成功回應 (201)：**
```json
{
    "success": true,
    "category": "Group",
    "message": "User added to group successfully",
    "data": {
        "success": true
    },
    "timestamp": "2025-06-23T19:13:17.767Z"
}
```

**權限要求：** 僅群組管理員

**業務規則：**
- 新成員以 member 權限加入分享團隊
- 無法新增已存在的成員



### 移除群組成員
從群組中移除用戶。

**端點：** `DELETE /group/:id/users/:targetUserId`

**需要身份驗證：** 是

**成功回應 (200)：**
```json
{
    "success": true,
    "category": "Group",
    "message": "User removed from group successfully",
    "data": {
        "success": true
    },
    "timestamp": "2025-06-23T19:14:14.015Z"
}
```

**權限要求：** 僅群組管理員

**刪除規則：**
- 無法移除群組建立者


---

## 權限模型

### 任務請求權限

| 操作 | 個人任務 | 團隊分享 （在團隊內） |
|------|----------|----------|
| 查看 | 限任務擁有者 | 任何成員 |
| 建立 | 任何人 | 任何成員 |
| 更新 | 限任務擁有者 | 任何成員 existing group id update require admin privileges |
| 刪除 | 限任務擁有者 | 任何成員 |
| 評論 | 限定任務擁有者 | 任何成員 |

### 群組權限

| 操作 | 成員 | 管理員 |
|------|------|--------|
| 查看任務 | ✓ | ✓ |
| 建立任務 | ✓ | ✓ |
| 新增成員 | ✗ | ✓ |
| 移除成員 | ✗ | ✓ |
| 刪除群組 | ✗ | ✓ |



---