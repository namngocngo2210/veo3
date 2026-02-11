export type Language = 'vi' | 'en';

export const translations = {
    vi: {
        // App
        appTitle: 'VeoX',
        tabText: 'Text → Video',
        tabImage: 'Image → Video',
        tabBanana: 'Nano Banana',
        tabVisualPrompts: 'Visual Prompts',
        tabConfig: 'Cấu hình',

        // Common
        save: 'Lưu',
        saved: 'Đã lưu',
        delete: 'Xóa',
        download: 'Tải xuống',
        downloadAll: 'Download All',
        generateAll: 'Generate All',
        stop: 'Stop Generating',
        retry: 'Thử lại',
        regenerate: 'Chạy lại',
        error: 'Lỗi',
        loading: 'Đang xử lý...',
        waiting: 'Đang chờ...',
        success: 'Thành công',
        promptPlaceholder: 'Nhập mô tả cho video...',
        refImagePlaceholder: 'Nhập prompt cho ảnh này...',

        // Config
        apiKeyLabel: 'Gemini API Key',
        apiKeyPlaceholder: 'Dán API key vào đây...',
        apiKeyHelp: 'Key được lưu cục bộ trên máy. Dùng chung cho Veo3 và Imagen.',
        getKeyLink: 'Lấy key tại đây',
        modelLabel: 'Veo Model',
        langLabel: 'Ngôn ngữ / Language',
        savePathLabel: 'Thư mục lưu video',
        chooseFolder: 'Chọn thư mục',

        // Text To Video
        addPrompt: 'Thêm Prompt',
        importExcel: 'Import Excel',
        clearAll: 'Xóa tất cả',
        queue: 'Hàng đợi',
        noPrompts: 'Chưa có prompt nào',
        details: 'Chi tiết',
        selectPrompt: 'Chọn prompt bên trái',
        noResults: 'Chưa có kết quả',
        generating: 'Đang tạo video...',
        videoWait: 'Video sẽ hiển thị ở đây',
        videoGenerated: 'Video đã tạo thành công nhưng URL không khả dụng. Kiểm tra thư mục lưu.',
        manualOrImport: 'Nhập thủ công hoặc import file .txt',

        // Image To Video
        addImages: 'Thêm ảnh (Multiple)',
        selectImages: 'Chọn ảnh từ bên trái để bắt đầu',
        imageDetails: 'Chi tiết ảnh',

        // Banana
        refImage: 'Ảnh tham khảo (Tùy chọn)',
        uploadedRef: 'Đã tải lên 1 ảnh',
        ratio: 'Tỉ lệ',
        numImages: 'Số lượng ảnh',
        refImagesTitle: 'Ảnh tham chiếu',
        uploadRefImage: 'Upload ảnh tham chiếu',
        addPromptToStart: 'Thêm prompt để bắt đầu',
        noImages: 'Không có ảnh',

        // Visual Prompts
        scriptLabel: 'Nhập kịch bản video',
        durationLabel: 'Thời lượng (giây)',
        genPrompts: 'Tạo Prompts',
        copy: 'Sao chép',
        sendToTextTab: 'Gửi qua Text-to-Video',
        promptsGenerated: 'Đã tạo {count} prompts',
        visualPromptPlaceholder: 'Dán kịch bản vào đây hoặc upload file .txt...',

        // Alerts
        alertNoKey: 'Lưu API Key trong Config trước!'
    },
    en: {
        // App
        appTitle: 'VeoX',
        tabText: 'Text → Video',
        tabImage: 'Image → Video',
        tabBanana: 'Nano Banana',
        tabVisualPrompts: 'Visual Prompts',
        tabConfig: 'Config',

        // Common
        save: 'Save',
        saved: 'Saved',
        delete: 'Delete',
        download: 'Download',
        downloadAll: 'Download All',
        generateAll: 'Generate All',
        stop: 'Stop Generating',
        retry: 'Retry',
        regenerate: 'Re-generate',
        error: 'Error',
        loading: 'Processing...',
        waiting: 'Waiting...',
        success: 'Success',
        promptPlaceholder: 'Enter description for video...',
        refImagePlaceholder: 'Enter prompt for this image...',

        // Config
        apiKeyLabel: 'Gemini API Key',
        apiKeyPlaceholder: 'Paste your API key here...',
        apiKeyHelp: 'Key is saved locally. Shared between Veo3 and Imagen.',
        getKeyLink: 'Get key here',
        modelLabel: 'Veo Model',
        langLabel: 'Ngôn ngữ / Language',
        savePathLabel: 'Video Output Folder',
        chooseFolder: 'Choose Folder',

        // Text To Video
        addPrompt: 'Add Prompt',
        importExcel: 'Import Excel',
        clearAll: 'Clear All',
        queue: 'Queue',
        noPrompts: 'No prompts yet',
        details: 'Details',
        selectPrompt: 'Select prompt on the left',
        noResults: 'No results yet',
        generating: 'Generating video...',
        videoWait: 'Video will appear here',
        videoGenerated: 'Video generated successfully but URL unavailable. Check output folder.',
        manualOrImport: 'Enter manually or import .txt file',

        // Image To Video
        addImages: 'Add Images (Multiple)',
        selectImages: 'Select images from the left to start',
        imageDetails: 'Image Details',

        // Banana
        refImage: 'Reference Image (Optional)',
        uploadedRef: 'Uploaded 1 image',
        ratio: 'Aspect Ratio',
        numImages: 'Number of Images',
        refImagesTitle: 'Reference Images',
        uploadRefImage: 'Upload Ref Image',
        addPromptToStart: 'Add prompt to start',
        noImages: 'No images',

        // Visual Prompts
        scriptLabel: 'Input Video Script',
        durationLabel: 'Duration (seconds)',
        genPrompts: 'Generate Prompts',
        copy: 'Copy',
        sendToTextTab: 'Send to Text-to-Video',
        promptsGenerated: 'Generated {count} prompts',
        visualPromptPlaceholder: 'Paste script here or upload .txt file...',

        // Alerts
        alertNoKey: 'Please save API Key in Config first!'
    }
};
