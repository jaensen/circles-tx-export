export type Profile = {
    username: string;
    address: string;
    avatarUrl: string;
};

export type SafeProfileMap = { [safeAddress: string]: Profile };

export type Transaction = {
    timestamp: Date;
    from: string;
    fromProfile?: Profile;
    to: string;
    crc: string;
    tc: string;
}
