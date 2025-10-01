export interface TabDynamicInfo {
    title: string;
    url: string;
    hidden: boolean;
}

export interface TabInfo {
    id: number;
    createdAt: number;
    dynamicInfo: TabDynamicInfo;
}

export interface PartialTabInfo extends Omit<TabInfo, "dynamicInfo"> {
    dynamicInfo?: TabDynamicInfo;
}
