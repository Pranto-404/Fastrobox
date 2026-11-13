#pragma once
// Uplink: sends the outbox to the server over HTTPS (server certificate checked against certs.h),
// oldest record first, with the device token from the setup page.
void startUplinkTask();
