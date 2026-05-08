FROM nginx:1.25-alpine

# Add metadata
LABEL maintainer="your-email@example.com"

# The nginx user and group (UID/GID 101) already exist in the alpine base image.

# Copy application files
COPY . /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Set proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx

# Redirect logs to stdout/stderr
RUN ln -sf /dev/stdout /var/log/nginx/access.log && \
    ln -sf /dev/stderr /var/log/nginx/error.log

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-80}/ || exit 1

# Run as non-root user
USER nginx

EXPOSE ${PORT:-80}

CMD ["sh", "-c", "nginx -g 'daemon off;'"]