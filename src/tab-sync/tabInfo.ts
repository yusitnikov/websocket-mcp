export interface TabDynamicInfo {
    title: string;
    url: string;
}

export interface TabInfo {
    id: number;
    createdAt: number;
    dynamicInfo: TabDynamicInfo;
}
