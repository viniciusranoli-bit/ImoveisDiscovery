export type AlertSendInput = {
  to: string;
  text: string;
};

export type AlertSendResult = {
  providerMessageId?: string;
};

export interface AlertChannel {
  send(input: AlertSendInput): Promise<AlertSendResult>;
}
