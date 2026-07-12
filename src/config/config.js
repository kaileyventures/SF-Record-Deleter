export const CONFIG = {
    API_VERSION: 'v58.0',
    COOKIE_NAME: 'sid',
    VALID_ID_LENGTHS: [15, 18],
    SF_DOMAINS: ['salesforce.com', 'force.com'],
    DOMAIN_MAPPING: [
        { from: '.lightning.force.com', to: '.my.salesforce.com' },
        { from: '.visual.force.com', to: '.my.salesforce.com' },
        { from: '--c.visualforce.com', to: '.my.salesforce.com' }
    ],
    HTTP_STATUS: {
        OK: 200,
        CREATED: 201,
        NO_CONTENT: 204
    },
    SALESFORCE_ERRORS: {
        ENTITY_DELETED: 'ENTITY_IS_DELETED'
    },
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000, // milliseconds
    REQUEST_DELAY: 100, // milliseconds between requests
    BUTTON_STYLES: {
        delete: { text: 'Delete Records', class: 'btn-delete' },
        insert: { text: 'Insert Records', class: 'btn-insert' },
        update: { text: 'Update Records', class: 'btn-update' }
    }
};
