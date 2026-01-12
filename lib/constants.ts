
import { StepConfig } from './types';

export const STEPS_CONFIG: StepConfig[] = [
    {
        id: 1,
        title: 'Bước 1: Tạo gợi ý kịch bản',
        description: 'Từ chủ đề bạn cung cấp, AI sẽ tìm kiếm và tổng hợp thông tin để tạo ra các gợi ý kịch bản sáng tạo, phù hợp với xu hướng hiện tại.',
        defaultPromptId: 'S1_CRIME_DOC_BD',
        buttonText: 'Tạo gợi ý kịch bản'
    },
    {
        id: 2,
        title: 'Bước 2: Lập Dàn Ý Kịch Bản (Outline)',
        description: 'Từ thông tin đã thu thập, AI sẽ xây dựng một cấu trúc kịch bản chặt chẽ. Bạn có thể chỉ định số lượng phân cảnh mong muốn.',
        defaultPromptId: 'S2_OUTLINE_CRIME_BD',
        buttonText: 'Lập Dàn Ý Chi Tiết'
    },
    {
        id: 3,
        title: 'Bước 3: Viết Kịch Bản Chi Tiết (Full Script)',
        description: 'Viết kịch bản hoàn chỉnh bao gồm lời bình (Voice-over) và mô tả hình ảnh (Visual). Hệ thống sẽ tự động chia nhỏ để đảm bảo đủ số lượng cảnh.',
        defaultPromptId: 'S3_SCRIPT_CRIME_BD',
        buttonText: 'Viết Kịch Bản Chi Tiết'
    },
    {
        id: 4,
        title: 'Bước 4: Trích Xuất Prompt Hình Ảnh/Video (JSON)',
        description: 'Tự động phân tích kịch bản và tạo ra các prompt chuyên sâu (Midjourney/Leonardo/Runway) dưới dạng file JSON.',
        defaultPromptId: 'S4_PROMPT_EXTRACTOR',
        buttonText: 'Tạo & Trích Xuất Prompt'
    },
    {
        id: 5,
        title: 'Bước 5: Tách Voice Over (Audio Script)',
        description: 'Tách riêng phần lời bình (Voice-over) từ kịch bản chi tiết để nạp vào các công cụ chuyển văn bản thành giọng nói (TTS).',
        defaultPromptId: 'S5_VO_EXTRACTOR',
        buttonText: 'Tách Lời Bình'
    },
    {
        id: 6,
        title: 'Bước 6: Tạo Metadata & Thumbnail',
        description: 'Tối ưu hóa SEO cho video với Tiêu đề, Mô tả, Tags và ý tưởng thiết kế Thumbnail thu hút click.',
        defaultPromptId: 'S6_METADATA_THUMB_BD',
        buttonText: 'Tạo Metadata & Thumbnail'
    }
];
