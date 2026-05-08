FROM nginx:1.25-alpine

# Add metadata
LABEL maintainer="your-email@example.com"

# The nginx user and group (UID/GID 101) already exist in the alpine base image.

# Copy application files
COPY . /usr/share/nginx/html

# Copy nginx config template (uses ${PORT} placeholder)
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Set proper permissions on web files
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d

# Redirect logs to stdout/stderr
RUN ln -sf /dev/stdout /var/log/nginx/access.log && \
    ln -sf /dev/stderr /var/log/nginx/error.log


# Run as non-root user
USER nginx

EXPOSE 8080

# At startup: substitute $PORT into nginx config, then launch nginx
CMD ["sh", "-c", "envsubst '$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]